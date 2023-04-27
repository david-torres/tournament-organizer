const ejs = require('ejs');
const path = require('path');
const { Op } = require('sequelize');
const { Tournament, Participant, Match, Member } = require('../models');
const { calculateUpdatedElo } = require('../utils');

// Create a new tournament
exports.createTournament = async (req, res) => {
  try {
    const newTournament = await Tournament.create(req.body);
    res.status(201).json(newTournament);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Add a participant to a tournament
exports.addParticipant = async (req, res) => {
  const memberId = req.body.member_id;
  const tournamentId = req.params.id;

  try {
    const tournament = await Tournament.findByPk(tournamentId);
    if (tournament) {
      const member = await Member.findByPk(memberId);
      if (member) {
        const participant = await Participant.create({
          tournamentId,
          memberId,
        });
        res.status(201).json(participant);
      } else {
        res.status(404).json({ error: 'Member not found' });
      }
    } else {
      res.status(404).json({ error: 'Tournament not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get participants in a tournament
exports.getParticipants = async (req, res) => {
  try {
    const tournament = await Tournament.findByPk(req.params.id, {
      include: [{ model: Participant, as: 'Participants', include: [{ model: Member, as: 'member' }] }],
    });

    if (tournament) {
      res.json(tournament.Participants);
    } else {
      res.status(404).json({ error: 'Tournament not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

function generateMatches(participants) {
  const matches = [];
  let matchIndex = 0;

  // Sort participants by ELO, descending
  participants.sort((a, b) => b.elo - a.elo);

  // Calculate the number of byes needed
  const rounds = Math.ceil(Math.log2(participants.length));
  const byesNeeded = Math.pow(2, rounds) - participants.length;

  // Assign byes to the highest-ranked participants
  for (let i = 0; i < byesNeeded; i++) {
    participants[i].bye = true;
  }

  // Randomize the remaining participants
  const remainingParticipants = participants.slice(byesNeeded);
  for (let i = remainingParticipants.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remainingParticipants[i], remainingParticipants[j]] = [remainingParticipants[j], remainingParticipants[i]];
  }

  // Combine the participants with byes and the randomized participants
  participants = [...participants.slice(0, byesNeeded), ...remainingParticipants];

  // Generate first-round matches
  for (let position = 1; position <= participants.length / 2; position++) {
    const player1 = participants[matchIndex++];
    const player2 = participants[matchIndex++];

    matches.push({
      round: 1,
      player1,
      player2,
    });
  }

  return matches;
}


// Start the tournament by generating matches for a single elimination tournament with byes based on ELO scores and random match-ups
exports.startTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findByPk(req.params.id, {
      include: [{ model: Participant, as: 'Participants' }],
    });

    if (tournament) {
      if (tournament.Participants.length < 2) {
        res.status(400).json({ error: 'Not enough participants to start the tournament' });
      } else {
        const matches = generateMatches(tournament.Participants);

        // Insert the generated matches into the database using Sequelize
        await Match.bulkCreate(matches.map((match) => ({
          round: match.round,
          player1Id: match.player1 ? match.player1.id : null,
          player2Id: match.player2 ? match.player2.id : null,
          tournamentId: tournament.id,
        })));

        res.status(200).json({ message: 'Tournament started, matches generated' });
      }
    } else {
      res.status(404).json({ error: 'Tournament not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const advanceRound = async (tournament) => {
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
};

// Update a match result and update participant ELO scores
exports.updateMatch = async (req, res) => {
  const tournamentId = req.params.id;
  const matchId = req.params.match_id;
  const winnerId = req.body.winner_id;

  try {
    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const match = await Match.findOne({
      where: {
        id: matchId,
        tournamentId: tournamentId
      }
    });

    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    const participant1 = await Participant.findOne({
      where: { id: match.player1Id },
      include: [{ model: Member, as: 'Member' }],
    });
    const participant2 = await Participant.findOne({
      where: { id: match.player2Id },
      include: [{ model: Member, as: 'Member' }],
    });

    const actualScore1 = winnerId === participant1.id ? 1 : 0;
    const actualScore2 = 1 - actualScore1;
    const [newElo1, newElo2] = calculateUpdatedElo(participant1.Member.elo, participant2.Member.elo, actualScore1, actualScore2);

    await match.update({ winnerId });
    await participant1.Member.update({ elo: newElo1 });
    await participant2.Member.update({ elo: newElo2 });

    // Call advanceRound
    await advanceRound(tournament);

    res.json({ message: 'Match updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


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
      participant1: {
        id: match.participant1.id,
        name: match.participant1.name
      },
      participant2: {
        id: match.participant2.id,
        name: match.participant2.name
      },
      winner: match.winner.id
        ? {
          id: match.winner.id,
          name: match.winner.name
        }
        : null
    });
  });

  return rounds;
}

async function generateBracketHtml(matches) {
  const templatePath = path.join(__dirname, '..', 'bracket.ejs');
  const html = await ejs.renderFile(templatePath, { matches });

  return html;
}

// Get the bracket for a tournament
exports.getBracket = async (req, res) => {
  const id = req.params.id;
  const format = req.query.format || 'json';

  try {
    const tournament = await Tournament.findByPk(id);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const matches = await Match.findAll({
      where: { tournamentOd: id },
      include: [
        { model: Participant, as: 'player1' },
        { model: Participant, as: 'player2' },
        { model: Participant, as: 'winner' }
      ],
      order: [['round', 'ASC'], ['id', 'ASC']]
    });

    const bracketData = getBracketData(matches);

    if (format === 'json') {
      res.json(bracketData);
    } else if (format === 'html') {
      const html = generateBracketHtml(bracketData);
      res.send(html);
    } else if (format === 'image') {
      // Generate and send image representation of the bracket
    } else {
      res.status(400).json({ error: 'Invalid format specified' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

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
        { model: Participant, as: 'player1', include: Member },
        { model: Participant, as: 'player2', include: Member },
        { model: Participant, as: 'winner', include: Member },
      ],
      order: [['id', 'ASC']],
    });

    res.json(matches);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

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
    res.status(500).json({ error: 'Internal server error' });
  }
}
