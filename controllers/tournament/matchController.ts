export {};

const { Op } = require('sequelize');
const { Tournament, Participant, Match, Member } = require('../../models');
const { updateElo } = require('../../utils');
const {
  advanceSingleElimination,
  advanceRoundRobin,
  advanceSwiss,
} = require('../../services/tournamentAdvancers');

const MATCH_INCLUDES = [
  { model: Participant, as: 'player1', include: { model: Member, as: 'member' } },
  { model: Participant, as: 'player2', include: { model: Member, as: 'member' } },
  { model: Participant, as: 'winner', include: { model: Member, as: 'member' } },
];

function getEligibleWinnerIds(participant1, participant2) {
  return [participant1, participant2]
    .filter(Boolean)
    .map((participant) => participant.id);
}

function getWinnerParticipant(participant1, participant2, winnerId) {
  return [participant1, participant2]
    .filter(Boolean)
    .find((participant) => String(participant.id) === String(winnerId));
}

async function createMatch(req, res) {
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

    if (tournament.type !== 'league') {
      return res.status(400).json({ error: 'Cannot create matches for a non-league tournament' });
    }

    if (tournament.status !== 'in_progress') {
      return res.status(404).json({ error: 'Tournament not yet started' });
    }

    const participant1 = tournament.participants.find((participant) => participant.id === parseInt(participant1Id, 10));
    const participant2 = tournament.participants.find((participant) => participant.id === parseInt(participant2Id, 10));

    if (!participant1 || !participant2) {
      return res.status(404).json({ error: 'Participant not found' });
    }

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

    const createdMatch = await Match.create({
      round: 1,
      player1Id: participant1.id,
      player2Id: participant2.id,
      tournamentId: tournament.id,
    });

    const match = await Match.findByPk(createdMatch.id, {
      include: MATCH_INCLUDES,
    });

    res.status(201).json(match);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}

async function updateMatch(req, res) {
  const tournamentId = req.params.id;
  const matchId = req.params.match_id;
  const winnerId = req.body.winner_id;

  try {
    const tournament = await Tournament.findByPk(tournamentId, {
      include: [
        { model: Participant, as: 'participants' },
        { model: Match, as: 'matches' },
      ],
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.status !== 'in_progress') {
      return res.status(404).json({ error: 'Tournament not yet started' });
    }

    const match = await Match.findOne({
      where: {
        id: matchId,
        tournamentId,
      },
      include: MATCH_INCLUDES,
    });

    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    const participant1 = match.player1;
    const participant2 = match.player2;
    const eligibleWinnerIds = getEligibleWinnerIds(participant1, participant2);

    if (!eligibleWinnerIds.some((id) => String(id) === String(winnerId))) {
      return res.status(400).json({ error: 'Winner must be one of the match participants' });
    }

    const winnerParticipant = getWinnerParticipant(participant1, participant2, winnerId);

    if (tournament.type === 'league') {
      await updateElo(participant1, participant2, winnerId);
    } else if (participant1 && participant2) {
      await updateElo(participant1.member, participant2.member, winnerParticipant.member.id);
    }

    await match.update({ winnerId: winnerParticipant.id });

    const advanceHandlers = {
      single_elimination: advanceSingleElimination,
      round_robin: advanceRoundRobin,
      swiss: advanceSwiss,
    };

    const advanceTournament = advanceHandlers[tournament.type];
    if (advanceTournament) {
      await advanceTournament(tournament);
    }

    res.json(match);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}

async function getMatches(req, res) {
  const { id } = req.params;
  const { status } = req.query;

  try {
    const tournament = await Tournament.findByPk(id);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const matchFilter: any = { tournamentId: id };

    if (status === 'completed') {
      matchFilter.winnerId = { [Op.ne]: null };
    } else if (status === 'pending') {
      matchFilter.winnerId = null;
    }

    const matches = await Match.findAll({
      where: matchFilter,
      include: MATCH_INCLUDES,
      order: [['id', 'ASC']],
    });

    res.json(matches);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  createMatch,
  updateMatch,
  getMatches,
};
