const ejs = require('ejs');
const path = require('path');
const { Op, UniqueConstraintError } = require('sequelize');
const { Tournament, Participant, Match, Member } = require('../models');
const { calculateUpdatedElo, isPowerOfTwo } = require('../utils');

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

// generate single elimination matchups
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

// generate round robin matchups
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


// Start the tournament by generating matches for a single elimination tournament with byes based on ELO scores and random match-ups
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

      // check if we have enough players
      if (tournament.participants.length < 2) {
        res.status(400).json({ error: 'Not enough participants to start the tournament' });
      } else {
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
          default:
            throw new Error('Invalid tournament type');
        }

        // Insert the generated matches into the database using Sequelize
        await Match.bulkCreate(matches.map(match => ({
          round: match.round,
          player1Id: match.player1Id ? match.player1Id : null,
          player2Id: match.player2Id ? match.player2Id : null,
          tournamentId: tournament.id,
        })));

        // Update the tournament status to 'in_progress'
        await tournament.update({ status: 'in_progress' });

        res.status(200).json({ message: 'Tournament started, matches generated' });
      }
    } else {
      res.status(404).json({ error: 'Tournament not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// check if all matches have been completed for a round and generate new matches or complete the tournament
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

// check if all matches have been completed for a round and generate new matches or complete the tournament
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

// Update a match result and update participant ELO scores
exports.updateMatch = async (req, res) => {
  const tournamentId = req.params.id;
  const matchId = req.params.match_id;
  const winnerId = req.body.winner_id;

  try {
    const tournament = await Tournament.findByPk(tournamentId, {
      include: { model: Participant, as: 'participants' },
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const match = await Match.findOne({
      where: {
        id: matchId,
        tournamentId
      }
    });

    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    const participant1 = await Participant.findOne({
      where: { id: match.player1Id },
      include: { model: Member, as: 'member' },
    });
    const participant2 = await Participant.findOne({
      where: { id: match.player2Id },
      include: { model: Member, as: 'member' },
    });

    const actualScore1 = winnerId === participant1.id ? 1 : 0;
    const actualScore2 = 1 - actualScore1;
    const [newElo1, newElo2] = calculateUpdatedElo(participant1.member.elo, participant2.member.elo, actualScore1, actualScore2);

    await match.update({ winnerId });
    await participant1.member.update({ elo: newElo1 });
    await participant2.member.update({ elo: newElo2 });

    // check if we advance the round
    switch (tournament.type) {
      case 'single_elimination': {
        await advanceSingleElimination(tournament);
        break;
      }
      case 'round_robin': {
        await advanceRoundRobin(tournament);
        break;
      }
    }

    res.json({ message: 'Match updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// returns match data
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
        name: match.player1.member.name
      },
      player2: {
        id: match.player2.member.id,
        name: match.player2.member.name
      },
      winner: match.winner
        ? {
          id: match.winner.member.id,
          name: match.winner.member.name
        }
        : null
    });
  });

  return rounds;
}

// builds an html view of match data
async function generateBracketHtml(rounds) {
  const templatePath = path.join(__dirname, '..', 'bracket.ejs');
  const html = await ejs.renderFile(templatePath, { rounds });

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
        { model: Participant, as: 'winner', include: { model: Member, as: 'member' } }
      ],
      order: [['round', 'ASC'], ['id', 'ASC']]
    });

    const bracketData = getBracketData(matches);

    if (format === 'json') {
      res.json(bracketData);
    } else if (format === 'html') {
      const html = await generateBracketHtml(bracketData);
      res.send(html);
    } else if (format === 'image') {
      // Generate and send image representation of the bracket
    } else {
      res.status(400).json({ error: 'Invalid format specified' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// fetch matches
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
}

// return the latest tournament
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
}
