const { Op, UniqueConstraintError } = require('sequelize');
const { Tournament, Participant, Match, Member } = require('../../models');
const { isPowerOfTwo, decayElo: applyDecay } = require('../../utils');
const {
  generateSingleEliminationMatches,
  generateRoundRobinMatches,
  generateSwissMatches,
} = require('../../services/matchGenerators');

async function createTournament(req, res) {
  try {
    const params = req.body;
    if (params.type === 'single_elimination' && !isPowerOfTwo(params.size)) {
      throw new Error('Single elimination tournament `size` must be a power of 2 (2, 4, 8, 16...');
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
}

async function addParticipant(req, res) {
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

    if (tournament.type === 'single_elimination') {
      const participants = await Participant.count({
        where: { tournamentId },
      });

      if (participants === tournament.size) {
        return res.status(409).json({ error: 'Tournament player limit already met' });
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
}

async function getParticipants(req, res) {
  try {
    const tournament = await Tournament.findByPk(req.params.id, {
      include: { model: Participant, as: 'participants', include: { model: Member, as: 'member' } },
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    res.json(tournament.participants);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function startTournament(req, res) {
  try {
    const tournament = await Tournament.findByPk(req.params.id, {
      include: { model: Participant, as: 'participants' },
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.status !== 'pending') {
      return res.status(400).json({ error: 'Tournament has already been started' });
    }

    const matchGenerators = {
      single_elimination: generateSingleEliminationMatches,
      round_robin: generateRoundRobinMatches,
      swiss: generateSwissMatches,
      league: () => null,
    };

    const generator = matchGenerators[tournament.type];
    if (!generator) {
      throw new Error('Invalid tournament type');
    }

    const matches = generator(tournament.participants);

    if (matches) {
      await Match.bulkCreate(
        matches.map((match) => ({
          round: match.round,
          player1Id: match.player1Id ? match.player1Id : null,
          player2Id: match.player2Id ? match.player2Id : null,
          tournamentId: tournament.id,
        })),
      );
    }

    await tournament.update({ status: 'in_progress' });

    res.status(200).json({ message: 'Tournament started, matches generated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function endTournament(req, res) {
  try {
    const tournament = await Tournament.findByPk(req.params.id, {
      include: { model: Participant, as: 'participants', include: { model: Member, as: 'member' } },
      order: [[{ model: Participant, as: 'participants' }, 'elo', 'DESC']],
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.type !== 'league') {
      return res.status(400).json({ error: 'Cannot end a non-league tournament' });
    }

    if (tournament.status !== 'in_progress') {
      return res.status(400).json({ error: 'Cannot end an unstarted tournament' });
    }

    const winner = tournament.participants[0];

    const status = 'completed';
    const winnerId = winner.member.id;

    await tournament.update({ status, winnerId });

    res.status(200).json({ message: 'Tournament completed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getLatestTournament(req, res) {
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

async function decayElo(req, res) {
  try {
    const { id } = req.params;

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
      const updatedParticipant = applyDecay(participant, lastMatch.updatedAt, new Date());
      await participant.update({ elo: updatedParticipant.elo });

      updatedParticipants.push({
        participant: { id: participant.id },
        member: {
          id: participant.member.id,
          name: participant.member.name,
        },
        elo: updatedParticipant.elo,
        elo_decay: {
          old: oldElo,
          new: updatedParticipant.elo,
          penalty: oldElo - updatedParticipant.elo,
        },
      });
    }

    res.json({ tournament, participants: updatedParticipants });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  createTournament,
  addParticipant,
  getParticipants,
  startTournament,
  endTournament,
  getLatestTournament,
  decayElo,
};

