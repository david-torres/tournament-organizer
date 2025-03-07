const ejs = require('ejs');
const path = require('path');
const { Op, UniqueConstraintError, where } = require('sequelize');
const { Tournament, Participant, Match, Member } = require('../models');
const { updateElo, isPowerOfTwo, generateBracketImage, decayElo } = require('../utils');
const member = require('../models/member');

// Create a new tournament
exports.createTournament = async (req, res) => {
  try {
    const params = req.body;
    if (params.type === 'single_elimination') {
      if (!(isPowerOfTwo(params.size))) {
        throw new Error("Single elimination tournament `size` must be a power of 2 (2, 4, 8, 16...");
      }
    }
    const newTournament = await Tournament.create(req.body);
    res.status(201).json(newTournament);
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      res.status(409).json({ error: 'Tournament must have a unique name' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

// Add a participant to a tournament
exports.addParticipant = async (req, res) => {
  try {
    const memberId = req.body.member_id;
    const tournamentId = req.params.id;

    if (!memberId || !tournamentId) {
      return res.status(400).json({ error: 'IDs not set' });
    }

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.type == 'single_elimination') {
      const participants = await Participant.count({
        where: { tournamentId }
      });

      if (participants === tournament.size) {
        res.status(409).json({ error: 'Tournament player limit already met' });
      }
    }

    await Participant.create({ memberId, tournamentId });

    res.status(201).json({ message: 'Participant added to the tournament' });

  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      res.status(409).json({ error: 'Member is already a participant in this tournament' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

// Get participants in a tournament
exports.getParticipants = async (req, res) => {
  try {
    const tournament = await Tournament.findByPk(req.params.id, {
      include: { model: Participant, as: 'participants', include: { model: Member, as: 'member' } },
    });

    if (tournament) {
      res.json(tournament.participants);
    } else {
      res.status(404).json({ error: 'Tournament not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Generate single elimination matchups
function generateSingleEliminationMatches(participants) {
  const matches = [];
  let matchIndex = 0;

  // Randomize the participants
  for (let i = participants.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [participants[i], participants[j]] = [participants[j], participants[i]];
  }

  // Generate first-round matches
  for (let position = 1; position <= participants.length / 2; position++) {
    const player1 = participants[matchIndex++];
    const player2 = participants[matchIndex++];

    matches.push({
      round: 1,
      player1Id: player1.id,
      player2Id: player2.id,
    });
  }

  return matches;
}

// Generate round robin matchups
function generateRoundRobinMatches(participants) {
  const matches = [];
  const rounds = participants.length % 2 === 0 ? participants.length - 1 : participants.length;
  const numberOfMatches = participants.length / 2;

  if (participants.length % 2 !== 0) {
    participants.push({ id: null }); // Add a "dummy participant" (bye) for odd number of participants
  }

  for (let round = 1; round <= rounds; round++) {
    for (let match = 1; match <= numberOfMatches; match++) {
      const player1 = participants[match - 1];
      const player2 = participants[participants.length - match];

      // Avoid duplicate matches and exclude matches with the "dummy participant"
      if (player1.id !== player2.id && player1.id !== null && player2.id !== null) {
        matches.push({
          round,
          player1Id: player1.id,
          player2Id: player2.id,
        });
      }
    }

    // Rotate the participants array, keeping the first participant fixed
    const firstParticipant = participants.shift();
    const secondParticipant = participants.shift();
    participants.push(firstParticipant);
    participants.unshift(secondParticipant);
  }

  return matches;
}

// Generate Swiss system matchups for the current round
function generateSwissMatches(participants, existingMatches = []) {
  // Sort participants by score (wins) and then by elo
  participants.sort((a, b) => {
    const aScore = existingMatches.filter(m =>
      m.winnerId === a.id
    ).length;
    const bScore = existingMatches.filter(m =>
      m.winnerId === b.id
    ).length;

    if (bScore !== aScore) {
      return bScore - aScore;
    }
    return b.elo - a.elo;
  });

  const matches = [];
  const paired = new Set();
  const currentRound = existingMatches.length > 0 ?
    Math.max(...existingMatches.map(m => m.round)) + 1 : 1;

  // Handle unpaired player if odd number (gets a bye)
  if (participants.length % 2 !== 0) {
    const byePlayer = participants.pop();
    matches.push({
      round: currentRound,
      player1Id: byePlayer.id,
      player2Id: null, // bye
    });
    paired.add(byePlayer.id);
  }

  // Try to pair players with similar scores
  for (let i = 0; i < participants.length; i++) {
    if (paired.has(participants[i].id)) continue;

    // Look for closest unpaired opponent
    for (let j = i + 1; j < participants.length; j++) {
      const player1 = participants[i];
      const player2 = participants[j];

      if (!paired.has(player2.id)) {
        matches.push({
          round: currentRound,
          player1Id: player1.id,
          player2Id: player2.id,
        });
        paired.add(player1.id);
        paired.add(player2.id);
        break;
      }
    }
  }

  return matches;
}

// Start the tournament by generating matches for a single elimination tournament with byes based on Elo scores and random match-ups
exports.startTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findByPk(req.params.id, {
      include: { model: Participant, as: 'participants' },
    });

    if (tournament) {
      // Check if the tournament has already been started
      if (tournament.status !== 'pending') {
        return res.status(400).json({ error: 'Tournament has already been started' });
      }

      let matches;
      switch (tournament.type) {
        case 'single_elimination': {
          matches = generateSingleEliminationMatches(tournament.participants);
          break;
        }
        case 'round_robin': {
          matches = generateRoundRobinMatches(tournament.participants);
          break;
        }
        case 'swiss': {
          matches = generateSwissMatches(tournament.participants);
          break;
        }
        case 'league': {
          // not needed
          break;
        }
        default:
          throw new Error('Invalid tournament type');
      }

      if (matches) {
        // Insert the generated matches into the database using Sequelize
        await Match.bulkCreate(matches.map(match => ({
          round: match.round,
          player1Id: match.player1Id ? match.player1Id : null,
          player2Id: match.player2Id ? match.player2Id : null,
          tournamentId: tournament.id,
        })));
      }

      // Update the tournament status to 'in_progress'
      await tournament.update({ status: 'in_progress' });

      res.status(200).json({ message: 'Tournament started, matches generated' });
    } else {
      res.status(404).json({ error: 'Tournament not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// update a tournament status to 'completed' and set the winner to the player with the highest Elo score
// note: this is only meant for league tournaments
exports.endTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findByPk(req.params.id, {
      include: { model: Participant, as: 'participants', include: { model: Member, as: 'member' } },
      order: [[{ model: Participant, as: 'participants' }, 'elo', 'DESC']],
    });

    if (tournament.type !== 'league') {
      return res.status(400).json({ error: 'Cannot end a non-league tournament' });
    }

    if (tournament.status !== 'in_progress') {
      return res.status(400).json({ error: 'Cannot end an unstarted tournament' });
    }

    // get the league participant with the highest Elo score
    const winner = tournament.participants[0];

    const status = 'completed';
    const winnerId = winner.member.id;

    await tournament.update({ status, winnerId });

    res.status(200).json({ message: 'Tournament completed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Check if all matches have been completed for a round and generate new matches or complete the tournament for single elimination
const advanceSingleElimination = async (tournament) => {
  try {
    const matches = await Match.findAll({
      where: {
        tournamentId: tournament.id
      },
      order: [['round', 'ASC']]
    });

    const latestRound = matches[matches.length - 1].round;
    const currentRoundMatches = matches.filter(match => match.round === latestRound);
    const completedMatches = currentRoundMatches.filter(match => match.winnerId !== null);

    if (completedMatches.length === currentRoundMatches.length) {
      console.log(`All matches completed for round #${latestRound}. Advancing round.`);

      const winners = completedMatches.map(match => match.winnerId);

      if (winners.length === 1) {
        console.log(`All rounds complete.`);
        await tournament.update({ winnerId: winners[0], status: 'completed' });
        return;
      }

      const nextRound = latestRound + 1;
      const newMatches = [];

      for (let i = 0; i < winners.length; i += 2) {
        const match = {
          round: nextRound,
          player1Id: winners[i],
          player2Id: winners[i + 1],
          tournamentId: tournament.id
        };
        newMatches.push(match);
      }

      await Match.bulkCreate(newMatches);
    }
  } catch (error) {
    console.error(error);
  }
}

// Check if all matches have been completed for a round and generate new matches or complete the tournament for round robin
async function advanceRoundRobin(tournament) {
  try {
    const matches = await Match.findAll({
      where: {
        tournamentId: tournament.id,
      },
      order: [['round', 'DESC']],
    });

    const latestRound = matches[0].round;
    const totalRounds = tournament.participants.length % 2 === 0
      ? tournament.participants.length - 1
      : tournament.participants.length;

    const completedMatches = matches.filter(match => match.winnerId !== null);

    if (completedMatches.length === matches.length) {
      console.log(`All matches completed for round #${latestRound}.`);

      if (latestRound === totalRounds) {
        console.log(`All rounds complete. Tournament finished.`);
        await tournament.update({ status: 'completed' });
      }
    }
  } catch (error) {
    console.error(error);
  }
}

// Check if all matches have been completed and generate new matches for Swiss tournament
async function advanceSwiss(tournament) {
  try {
    const matches = await Match.findAll({
      where: { tournamentId: tournament.id },
      order: [['round', 'DESC']],
    });

    const participants = tournament.participants;
    const latestRound = matches.length > 0 ? matches[0].round : 0;
    const currentRoundMatches = matches.filter(m => m.round === latestRound);
    const completedMatches = currentRoundMatches.filter(m => m.winnerId !== null);

    // If all matches in current round are complete
    if (completedMatches.length === currentRoundMatches.length) {
      // Check if we've reached the maximum number of rounds
      // Swiss typically uses log2(n) rounded up + 1 rounds
      const maxRounds = Math.ceil(Math.log2(participants.length)) + 1;

      if (latestRound >= maxRounds) {
        // Tournament is complete - update winner based on most wins
        const playerScores = participants.map(p => ({
          participant: p,
          wins: matches.filter(m => m.winnerId === p.id).length
        }));

        playerScores.sort((a, b) => b.wins - a.wins || b.participant.elo - a.participant.elo);
        await tournament.update({
          status: 'completed',
          winnerId: playerScores[0].participant.memberId
        });
        return;
      }

      // Generate next round matches
      const newMatches = generateSwissMatches(participants, matches);
      await Match.bulkCreate(newMatches.map(match => ({
        ...match,
        tournamentId: tournament.id
      })));
    }
  } catch (error) {
    console.error(error);
  }
}

// Create a match with provided participants
exports.createMatch = async (req, res) => {
  const tournamentId = req.params.id;
  const participant1Id = req.body.participant1;
  const participant2Id = req.body.participant2;

  try {
    const tournament = await Tournament.findByPk(tournamentId, {
      include: { model: Participant, as: 'participants' },
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // check if this is a "league" tournament
    if (tournament.type !== 'league') {
      return res.status(400).json({ error: 'Cannot create matches for a non-league tournament' });
    }

    // make sure the tournament has been started
    if (tournament.status !== 'in_progress') {
      return res.status(404).json({ error: 'Tournament not yet started' });
    }

    const participant1 = tournament.participants.find(participant => participant.id === parseInt(participant1Id));
    const participant2 = tournament.participants.find(participant => participant.id === parseInt(participant2Id));

    if (!participant1 || !participant2) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    // make sure the participants are not already in a match with each other that does not have a winner
    const matches = await Match.findAll({
      where: {
        tournamentId,
        [Op.or]: [
          { player1Id: participant1.id, player2Id: participant2.id },
          { player1Id: participant2.id, player2Id: participant1.id },
        ],
        winnerId: null,
      },
    });

    if (matches.length > 0) {
      return res.status(409).json({ error: 'Participants have an unresolved match' });
    }

    const match = await Match.create({
      round: 1,
      player1Id: participant1.id,
      player2Id: participant2.id,
      tournamentId: tournament.id,
    }).then((match) => {
      return Match.findByPk(match.id, {
        include: [
          { model: Participant, as: 'player1', include: { model: Member, as: 'member' } },
          { model: Participant, as: 'player2', include: { model: Member, as: 'member' } },
          { model: Participant, as: 'winner', include: { model: Member, as: 'member' } },
        ],
      });
    });

    res.status(201).json(match);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}

// Update a match result and update participant Elo scores
exports.updateMatch = async (req, res) => {
  const tournamentId = req.params.id;
  const matchId = req.params.match_id;
  const winnerId = req.body.winner_id;

  try {
    const tournament = await Tournament.findByPk(tournamentId, {
      include: [
        { model: Participant, as: 'participants' },
        { model: Match, as: 'matches' },
      ]
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // make sure the tournament has been started
    if (tournament.status !== 'in_progress') {
      return res.status(404).json({ error: 'Tournament not yet started' });
    }

    const match = await Match.findOne({
      where: {
        id: matchId,
        tournamentId
      },
      include: [
        { model: Participant, as: 'player1', include: { model: Member, as: 'member' } },
        { model: Participant, as: 'player2', include: { model: Member, as: 'member' } },
        { model: Participant, as: 'winner', include: { model: Member, as: 'member' } },
      ]
    });

    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    const participant1 = match.player1;
    const participant2 = match.player2;

    if (tournament.type === 'league') {
      // calculate participant scores for league tournament
      await updateElo(participant1, participant2, winnerId);
    } else {
      // calculate member scores for non-league tournament
      if (participant1 && participant2) { // make sure not a bye
        await updateElo(participant1.member, participant2.member, winnerId);
      }
    }

    await match.update({ winnerId });

    // Check if we advance the round
    switch (tournament.type) {
      case 'single_elimination': {
        await advanceSingleElimination(tournament);
        break;
      }
      case 'round_robin': {
        await advanceRoundRobin(tournament);
        break;
      }
      case 'swiss': {
        await advanceSwiss(tournament);
        break;
      }
    }

    res.json(match);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// Return match data
function getBracketData(matches) {
  const rounds = {};

  matches.forEach((match) => {
    const roundNumber = match.round;
    if (!rounds[roundNumber]) {
      rounds[roundNumber] = [];
    }

    rounds[roundNumber].push({
      id: match.id,
      round: roundNumber,
      player1: {
        id: match.player1.member.id,
        name: match.player1.member.name,
      },
      player2: {
        id: match.player2.member.id,
        name: match.player2.member.name,
      },
      winner: match.winner
        ? {
          id: match.winner.member.id,
          name: match.winner.member.name,
        }
        : null,
    });
  });

  return rounds;
}

// Builds an HTML view of match data
async function generateBracketHtml(tournament, rounds) {
  const templatePath = path.join(__dirname, '..', 'bracket.ejs');
  const html = await ejs.renderFile(templatePath, { tournament, rounds });

  return html;
}

// Get the bracket for a tournament
exports.getBracket = async (req, res) => {
  const tournamentId = req.params.id;
  const format = req.query.format || 'json';

  try {
    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const matches = await Match.findAll({
      where: { tournamentId },
      include: [
        { model: Participant, as: 'player1', include: { model: Member, as: 'member' } },
        { model: Participant, as: 'player2', include: { model: Member, as: 'member' } },
        { model: Participant, as: 'winner', include: { model: Member, as: 'member' } },
      ],
      order: [['round', 'ASC'], ['id', 'ASC']],
    });

    const bracketData = getBracketData(matches);

    if (format === 'json') {
      res.json(bracketData);
    } else if (format === 'html') {
      const html = await generateBracketHtml(tournament, bracketData);
      res.send(html);
    } else if (format === 'image') {
      // Generate and send image representation of the bracket
      const html = await generateBracketHtml(tournament, bracketData);
      const img = await generateBracketImage(html);
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(img, 'binary');
    } else {
      res.status(400).json({ error: 'Invalid format specified' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// Fetch matches
exports.getMatches = async (req, res) => {
  const { id } = req.params;
  const { status } = req.query;

  try {
    const tournament = await Tournament.findByPk(id);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    let matchFilter = { tournamentId: id };

    if (status === 'completed') {
      matchFilter.winnerId = { [Op.ne]: null };
    } else if (status === 'pending') {
      matchFilter.winnerId = null;
    }

    const matches = await Match.findAll({
      where: matchFilter,
      include: [
        { model: Participant, as: 'player1', include: { model: Member, as: 'member' } },
        { model: Participant, as: 'player2', include: { model: Member, as: 'member' } },
        { model: Participant, as: 'winner', include: { model: Member, as: 'member' } },
      ],
      order: [['id', 'ASC']],
    });

    res.json(matches);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// Return the latest tournament
exports.getLatestTournament = async (req, res) => {
  try {
    const latestTournament = await Tournament.findOne({
      order: [['id', 'DESC']],
    });

    if (!latestTournament) {
      return res.status(404).json({ error: 'No tournaments found' });
    }

    res.json(latestTournament);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// Decay ELO scores for all participants in a league. intended to run as a once-per-day cron job
exports.decayElo = async (req, res) => {
  try {
    const { id } = req.params;

    // get the latest tournament id
    const tournament = await Tournament.findByPk(id);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    if (tournament.status !== 'in_progress') {
      return res.status(404).json({ error: 'No tournaments in progress' });
    }

    const participants = await Participant.findAll({
      where: { tournamentId: tournament.id },
      include: { model: Member, as: 'member' },
    });

    const updatedParticipants = [];

    for (const participant of participants) {
      // find last match for this tournament that this participant was in
      const lastMatch = await Match.findOne({
        where: {
          tournamentId: tournament.id,
          [Op.or]: [{ player1Id: participant.id }, { player2Id: participant.id }],
          winnerId: { [Op.ne]: null },
        },
        order: [['updatedAt', 'DESC']],
      });

      if (!lastMatch) {
        continue;
      }

      const oldElo = participant.elo;
      const updatedParticipant = decayElo(participant, lastMatch.updatedAt, new Date());
      await participant.update({ elo: updatedParticipant.elo });

      updatedParticipants.push({
        participant: { id: participant.id },
        member: {
          id: participant.member.id,
          name: participant.member.name
        },
        elo: updatedParticipant.elo,
        elo_decay: {
          old: oldElo,
          new: updatedParticipant.elo,
          penalty: oldElo - updatedParticipant.elo,
        }
      });
    }

    res.json({ tournament, participants: updatedParticipants });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
