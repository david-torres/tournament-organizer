export {};

const { Op, TimeoutError } = require('sequelize');
const { loadSourceModule } = require('../../runtime/loadSourceModule');
const { Tournament, Participant, Match, Member, sequelize } = loadSourceModule('models');
const { updateElo } = require('../../utils');
const { getPagination, setPaginationHeaders } = require('../../services/pagination');
const {
  advanceSingleElimination,
  advanceRoundRobin,
  advanceLeague,
  advanceSwiss,
} = require('../../services/tournamentAdvancers');

const MATCH_INCLUDES = [
  { model: Participant, as: 'player1', include: { model: Member, as: 'member' } },
  { model: Participant, as: 'player2', include: { model: Member, as: 'member' } },
  { model: Participant, as: 'winner', include: { model: Member, as: 'member' } },
];

function isSqliteBusyError(error) {
  return error?.parent?.code === 'SQLITE_BUSY' || error?.original?.code === 'SQLITE_BUSY' || error?.message?.includes('SQLITE_BUSY');
}

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
    const outcome = await sequelize.transaction(async (transaction) => {
      const tournament = await Tournament.findByPk(tournamentId, {
        include: { model: Participant, as: 'participants' },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!tournament) {
        return { status: 404, body: { error: 'Tournament not found' } };
      }

      if (tournament.type !== 'league') {
        return { status: 400, body: { error: 'Manual match creation is only supported for league tournaments' } };
      }

      if (tournament.status !== 'in_progress') {
        return { status: 404, body: { error: 'Tournament not yet started' } };
      }

      if (await Match.count({ where: { tournamentId }, transaction, lock: transaction.LOCK.UPDATE }) > 0) {
        return { status: 409, body: { error: 'League fixtures are generated automatically when the tournament starts' } };
      }

      const participant1 = tournament.participants.find((participant) => participant.id === parseInt(participant1Id, 10));
      const participant2 = tournament.participants.find((participant) => participant.id === parseInt(participant2Id, 10));

      if (!participant1 || !participant2) {
        return { status: 404, body: { error: 'Participant not found' } };
      }

      const [orderedParticipant1, orderedParticipant2] = [participant1, participant2].sort((left, right) => left.id - right.id);

      const existingMatch = await Match.findOne({
        where: {
          tournamentId,
          player1Id: orderedParticipant1.id,
          player2Id: orderedParticipant2.id,
          winnerId: null,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (existingMatch) {
        return { status: 409, body: { error: 'Participants have an unresolved match' } };
      }

      const createdMatch = await Match.create(
        {
          round: 1,
          player1Id: orderedParticipant1.id,
          player2Id: orderedParticipant2.id,
          tournamentId: tournament.id,
        },
        { transaction },
      );

      const match = await Match.findByPk(createdMatch.id, {
        include: MATCH_INCLUDES,
        transaction,
      });

      return { status: 201, body: match };
    });

    res.status(outcome.status).json(outcome.body);
  } catch (error) {
    if (error instanceof TimeoutError || isSqliteBusyError(error)) {
      res.status(409).json({ error: 'Participants have an unresolved match' });
    } else {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  }
}

async function updateMatch(req, res) {
  const tournamentId = req.params.id;
  const matchId = req.params.match_id;
  const winnerId = req.body.winner_id;

  try {
    const outcome = await sequelize.transaction(async (transaction) => {
      const tournament = await Tournament.findByPk(tournamentId, {
        include: [
          { model: Participant, as: 'participants' },
          { model: Match, as: 'matches' },
        ],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!tournament) {
        return { status: 404, body: { error: 'Tournament not found' } };
      }

      if (tournament.status !== 'in_progress') {
        return { status: 404, body: { error: 'Tournament not yet started' } };
      }

      const match = await Match.findOne({
        where: {
          id: matchId,
          tournamentId,
        },
        include: MATCH_INCLUDES,
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!match) {
        return { status: 404, body: { error: 'Match not found' } };
      }

      if (match.winnerId != null) {
        return { status: 409, body: { error: 'Match has already been completed' } };
      }

      const participant1 = match.player1;
      const participant2 = match.player2;
      const eligibleWinnerIds = getEligibleWinnerIds(participant1, participant2);

      if (!eligibleWinnerIds.some((id) => String(id) === String(winnerId))) {
        return { status: 400, body: { error: 'Winner must be one of the match participants' } };
      }

      const winnerParticipant = getWinnerParticipant(participant1, participant2, winnerId);

      if (tournament.type === 'league') {
        await updateElo(participant1, participant2, winnerId, { transaction });
      } else if (participant1 && participant2) {
        await updateElo(participant1.member, participant2.member, winnerParticipant.member.id, { transaction });
      }

      await match.update({ winnerId: winnerParticipant.id }, { transaction });

      const advanceHandlers = {
        single_elimination: advanceSingleElimination,
        round_robin: advanceRoundRobin,
        league: advanceLeague,
        swiss: advanceSwiss,
      };

      const advanceTournament = advanceHandlers[tournament.type];
      if (advanceTournament) {
        await advanceTournament(tournament, { transaction });
      }

      const refreshedMatch = await Match.findByPk(match.id, {
        include: MATCH_INCLUDES,
        transaction,
      });

      return { status: 200, body: refreshedMatch };
    });

    res.status(outcome.status).json(outcome.body);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}

async function getMatches(req, res) {
  const { id } = req.params;
  const { status } = req.query;

  try {
    const pagination = getPagination(req.query);
    if (pagination.error) {
      return res.status(400).json({ error: pagination.error });
    }

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

    const { rows: matches, count } = await Match.findAndCountAll({
      where: matchFilter,
      include: MATCH_INCLUDES,
      order: [['id', 'ASC']],
      limit: pagination.limit,
      offset: pagination.offset,
    });

    setPaginationHeaders(res, count, pagination.page, pagination.limit);
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
