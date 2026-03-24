export {};

const { Op, TimeoutError } = require('sequelize');
const { loadSourceModule } = require('../../runtime/loadSourceModule');
const { Tournament, Participant, Match, Member, sequelize } = loadSourceModule('models');
const { updateElo } = require('../../utils');
const { getPagination, setPaginationHeaders } = require('../../services/pagination');
const { isMatchCompleted } = require('../../services/matchState');
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
const DRAW_ALLOWED_TOURNAMENT_TYPES = new Set(['round_robin', 'league']);
const LEAGUE_TOURNAMENT_TYPE = 'league';

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

function parseNullableInteger(value, fieldName) {
  if (value === undefined) {
    return { provided: false, value: undefined };
  }

  if (value === null) {
    return { provided: true, value: null };
  }

  const parsedValue = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    return { provided: true, error: `${fieldName} must be a non-negative integer or null` };
  }

  return { provided: true, value: parsedValue };
}

function parseNullableDate(value, fieldName) {
  if (value === undefined) {
    return { provided: false, value: undefined };
  }

  if (value === null) {
    return { provided: true, value: null };
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return { provided: true, error: `${fieldName} must be a valid ISO date or null` };
  }

  return { provided: true, value: parsedDate };
}

function getSchedulingUpdates(body) {
  const updates: any = {};
  const scheduledAt = parseNullableDate(body.scheduled_at, 'scheduled_at');

  if (scheduledAt.error) {
    return { error: scheduledAt.error };
  }

  if (scheduledAt.provided) {
    updates.scheduledAt = scheduledAt.value;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'location')) {
    updates.location = body.location;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    updates.notes = body.notes;
  }

  return { updates };
}

function hasSchedulingUpdates(body) {
  return ['scheduled_at', 'location', 'notes'].some((field) => Object.prototype.hasOwnProperty.call(body, field));
}

function hasResultUpdates(body) {
  return [
    'winner_id',
    'is_draw',
    'forfeit_by_participant_id',
    'player1_score',
    'player2_score',
  ].some((field) => Object.prototype.hasOwnProperty.call(body, field));
}

function getEloTargets(tournamentType, participant1, participant2) {
  if (tournamentType === LEAGUE_TOURNAMENT_TYPE) {
    return [participant1, participant2];
  }

  return [participant1?.member, participant2?.member];
}

async function applyMatchOutcome(tournament, match, participant1, participant2, body, options: any = {}) {
  const player1Score = parseNullableInteger(body.player1_score, 'player1_score');
  const player2Score = parseNullableInteger(body.player2_score, 'player2_score');

  if (player1Score.error || player2Score.error) {
    return { status: 400, body: { error: player1Score.error || player2Score.error } };
  }

  const winnerId = body.winner_id;
  const forfeitByParticipantId = body.forfeit_by_participant_id;
  const isDraw = body.is_draw === true;
  const eligibleWinnerIds = getEligibleWinnerIds(participant1, participant2);

  if (isDraw && !DRAW_ALLOWED_TOURNAMENT_TYPES.has(tournament.type)) {
    return { status: 400, body: { error: 'Draw results are only supported for round robin and league tournaments' } };
  }

  if (isDraw && (winnerId !== undefined || forfeitByParticipantId !== undefined)) {
    return { status: 400, body: { error: 'Draw results cannot also specify a winner or forfeit' } };
  }

  if (!isDraw && winnerId === undefined && forfeitByParticipantId === undefined) {
    return { status: 400, body: { error: 'A match result must include a winner, draw, or forfeit' } };
  }

  if (forfeitByParticipantId !== undefined && !eligibleWinnerIds.some((id) => String(id) === String(forfeitByParticipantId))) {
    return { status: 400, body: { error: 'Forfeit must be assigned to one of the match participants' } };
  }

  if (isDraw && player1Score.provided && player2Score.provided && player1Score.value !== player2Score.value) {
    return { status: 400, body: { error: 'Drawn matches must have equal scores when both scores are provided' } };
  }

  let winnerParticipant = null;
  let resultType = 'draw';
  let resolvedForfeitByParticipantId = null;

  if (!isDraw) {
    if (forfeitByParticipantId !== undefined) {
      resolvedForfeitByParticipantId = forfeitByParticipantId;
      winnerParticipant = [participant1, participant2].find((participant) => String(participant.id) !== String(forfeitByParticipantId));
      resultType = 'forfeit';
    } else {
      if (!eligibleWinnerIds.some((id) => String(id) === String(winnerId))) {
        return { status: 400, body: { error: 'Winner must be one of the match participants' } };
      }

      winnerParticipant = getWinnerParticipant(participant1, participant2, winnerId);
      resultType = 'win';
    }

    if (
      player1Score.provided
      && player2Score.provided
      && player1Score.value === player2Score.value
    ) {
      return { status: 400, body: { error: 'Completed wins and forfeits must not have tied scores' } };
    }
  }

  const updates: any = {
    player1Score: player1Score.provided ? player1Score.value : match.player1Score ?? null,
    player2Score: player2Score.provided ? player2Score.value : match.player2Score ?? null,
    winnerId: winnerParticipant?.id ?? null,
    completedAt: new Date(),
    resultType,
    forfeitByParticipantId: resolvedForfeitByParticipantId,
  };

  if (participant1 && participant2) {
    const [eloTarget1, eloTarget2] = getEloTargets(tournament.type, participant1, participant2);
    updates.player1EloBefore = eloTarget1.elo;
    updates.player2EloBefore = eloTarget2.elo;

    if (winnerParticipant) {
      await updateElo(eloTarget1, eloTarget2, tournament.type === LEAGUE_TOURNAMENT_TYPE ? winnerParticipant.id : winnerParticipant.member.id, options);
    }

    updates.player1EloAfter = eloTarget1.elo;
    updates.player2EloAfter = eloTarget2.elo;
  }

  await match.update(updates, options);
  return { status: 200 };
}

async function restoreMatchElo(tournament, match, participant1, participant2, options: any = {}) {
  if (!participant1 || !participant2) {
    return;
  }

  if (match.player1EloBefore == null || match.player2EloBefore == null) {
    return;
  }

  const [eloTarget1, eloTarget2] = getEloTargets(tournament.type, participant1, participant2);

  await eloTarget1.update({ elo: match.player1EloBefore }, options);
  await eloTarget2.update({ elo: match.player2EloBefore }, options);
}

async function canCorrectLeagueMatch(match, transaction) {
  if (!match.completedAt) {
    return false;
  }

  const participantIds = [match.player1Id, match.player2Id].filter(Boolean);
  const laterRelatedMatchCount = await Match.count({
    where: {
      tournamentId: match.tournamentId,
      completedAt: {
        [Op.gt]: match.completedAt,
      },
      [Op.or]: participantIds.flatMap((participantId) => [
        { player1Id: participantId },
        { player2Id: participantId },
      ]),
    },
    transaction,
  });

  return laterRelatedMatchCount === 0;
}

async function createMatch(req, res) {
  const tournamentId = req.params.id;
  const participant1Id = req.body.participant1;
  const participant2Id = req.body.participant2;

  try {
    const outcome = await sequelize.transaction(async (transaction) => {
      const scheduling = getSchedulingUpdates(req.body);
      if (scheduling.error) {
        return { status: 400, body: { error: scheduling.error } };
      }

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
          completedAt: null,
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
          ...scheduling.updates,
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

      const scheduling = getSchedulingUpdates(req.body);
      if (scheduling.error) {
        return { status: 400, body: { error: scheduling.error } };
      }

      if (isMatchCompleted(match)) {
        return { status: 409, body: { error: 'Match has already been completed' } };
      }

      if (!hasResultUpdates(req.body)) {
        if (!hasSchedulingUpdates(req.body)) {
          return { status: 400, body: { error: 'No supported match fields were provided' } };
        }

        await match.update(scheduling.updates, { transaction });

        const refreshedScheduledMatch = await Match.findByPk(match.id, {
          include: MATCH_INCLUDES,
          transaction,
        });

        return { status: 200, body: refreshedScheduledMatch };
      }

      const participant1 = match.player1;
      const participant2 = match.player2;
      const outcome = await applyMatchOutcome(tournament, match, participant1, participant2, req.body, { transaction });
      if (outcome.status !== 200) {
        return outcome;
      }

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

async function correctMatchResult(req, res) {
  const tournamentId = req.params.id;
  const matchId = req.params.match_id;

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

      if (tournament.type !== LEAGUE_TOURNAMENT_TYPE) {
        return { status: 409, body: { error: 'Safe result correction is only supported for league matches' } };
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

      if (!isMatchCompleted(match) || match.resultType === 'bye') {
        return { status: 409, body: { error: 'Only completed non-bye matches can be corrected' } };
      }

      if (!(await canCorrectLeagueMatch(match, transaction))) {
        return { status: 409, body: { error: 'Cannot correct a match after later completed matches involve the same participants' } };
      }

      const participant1 = match.player1;
      const participant2 = match.player2;

      await restoreMatchElo(tournament, match, participant1, participant2, { transaction });
      await tournament.update({ status: 'in_progress', winnerId: null }, { transaction });

      const correction = await applyMatchOutcome(tournament, match, participant1, participant2, req.body, { transaction });
      if (correction.status !== 200) {
        return correction;
      }

      await match.update({
        correctionCount: (match.correctionCount || 0) + 1,
        correctedAt: new Date(),
        correctionReason: req.body.correction_reason ?? match.correctionReason ?? null,
      }, { transaction });

      await advanceLeague(tournament, { transaction });

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
      matchFilter[Op.or] = [
        { completedAt: { [Op.ne]: null } },
        { winnerId: { [Op.ne]: null } },
        { resultType: 'draw' },
      ];
    } else if (status === 'pending') {
      matchFilter.completedAt = null;
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
  correctMatchResult,
  updateMatch,
  getMatches,
};
