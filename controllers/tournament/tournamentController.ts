export {};

const { Op, TimeoutError, UniqueConstraintError } = require('sequelize');
const { loadSourceModule } = require('../../runtime/loadSourceModule');
const { Tournament, Participant, Match, Member, sequelize } = loadSourceModule('models');
const { isPowerOfTwo, decayElo: applyDecay } = require('../../utils');
const { getStandingsForTournament } = require('../../services/standings');
const { getPagination, setPaginationHeaders } = require('../../services/pagination');
const {
  generateDoubleEliminationMatches,
  generateSingleEliminationMatches,
  generateRoundRobinMatches,
  generateLeagueMatches,
  generateSwissMatches,
  sortParticipantsForSetup,
} = require('../../services/matchGenerators');

const MATCH_GENERATORS = {
  double_elimination: generateDoubleEliminationMatches,
  single_elimination: generateSingleEliminationMatches,
  round_robin: generateRoundRobinMatches,
  swiss: generateSwissMatches,
  league: generateLeagueMatches,
};
const INITIAL_PARTICIPANT_ELO = 1200;
const ARCHIVED_TOURNAMENT_STATUS = 'archived';
const PENDING_TOURNAMENT_STATUS = 'pending';
const IN_PROGRESS_TOURNAMENT_STATUS = 'in_progress';
const ALLOWED_TOURNAMENT_UPDATE_FIELDS = ['name', 'size', 'status'];
const ALLOWED_PARTICIPANT_UPDATE_FIELDS = ['seed'];
const BRACKET_SIZE_TOURNAMENT_TYPES = new Set(['single_elimination', 'double_elimination']);

function isSqliteBusyError(error) {
  return error?.parent?.code === 'SQLITE_BUSY' || error?.original?.code === 'SQLITE_BUSY' || error?.message?.includes('SQLITE_BUSY');
}

function getLeagueWinnerParticipantId(winnerParticipant) {
  return winnerParticipant.participantId ?? winnerParticipant.id;
}

function hasReachedParticipantLimit(tournament, participantCount) {
  return BRACKET_SIZE_TOURNAMENT_TYPES.has(tournament.type) && participantCount === tournament.size;
}

function requiresPowerOfTwoSize(type) {
  return BRACKET_SIZE_TOURNAMENT_TYPES.has(type);
}

function requiresFullBracketBeforeStart(type) {
  return type === 'double_elimination';
}

function getParticipantListOrder() {
  return [
    [sequelize.literal('"Participant"."seed" IS NULL'), 'ASC'],
    ['seed', 'ASC'],
    ['id', 'ASC'],
  ];
}

function getTournamentMatchesPayload(tournament, matches) {
  const generatedAt = new Date();

  return matches.map((match) => ({
    bracket: match.bracket ?? null,
    position: match.position ?? null,
    round: match.round,
    player1Id: match.player1Id ?? null,
    player2Id: match.player2Id ?? null,
    winnerId: match.player2Id === null ? match.player1Id : match.winnerId ?? null,
    resultType: match.player2Id === null ? 'bye' : null,
    completedAt: match.player2Id === null ? generatedAt : null,
    tournamentId: tournament.id,
  }));
}

function getTournamentFilters(query) {
  const filters: any = {};

  if (query.status) {
    filters.status = query.status;
  }

  if (query.type) {
    filters.type = query.type;
  }

  return filters;
}

function getUnsupportedUpdateFields(payload) {
  return Object.keys(payload).filter((field) => !ALLOWED_TOURNAMENT_UPDATE_FIELDS.includes(field));
}

function canArchiveTournament(tournament) {
  return tournament.status !== IN_PROGRESS_TOURNAMENT_STATUS;
}

function parseSeedValue(rawSeed) {
  if (rawSeed === undefined) {
    return { provided: false, value: undefined };
  }

  if (rawSeed === null) {
    return { provided: true, value: null };
  }

  const parsedSeed = Number.parseInt(String(rawSeed), 10);
  if (!Number.isInteger(parsedSeed) || parsedSeed <= 0) {
    return { provided: true, error: 'Participant seed must be a positive integer or null' };
  }

  return { provided: true, value: parsedSeed };
}

function getCompletedMatchFilter(tournamentId) {
  return {
    tournamentId,
    [Op.or]: [
      { completedAt: { [Op.ne]: null } },
      { winnerId: { [Op.ne]: null } },
    ],
  };
}

function mergeLastActiveRows(lastActiveAtByParticipantId, rows) {
  rows.forEach((row) => {
    if (row.participantId == null || row.lastActiveAt == null) {
      return;
    }

    const participantId = Number(row.participantId);
    const lastActiveAt = new Date(row.lastActiveAt);
    const existingLastActiveAt = lastActiveAtByParticipantId.get(participantId);

    if (!existingLastActiveAt || lastActiveAt > existingLastActiveAt) {
      lastActiveAtByParticipantId.set(participantId, lastActiveAt);
    }
  });
}

async function getLastActiveAtByParticipantId(tournamentId, participantIds) {
  if (participantIds.length === 0) {
    return new Map();
  }

  const lastActivityExpression = sequelize.fn(
    'MAX',
    sequelize.fn('COALESCE', sequelize.col('completedAt'), sequelize.col('updatedAt')),
  );
  const completedMatchFilter = getCompletedMatchFilter(tournamentId);

  const [player1Rows, player2Rows] = await Promise.all([
    Match.findAll({
      attributes: [
        ['player1Id', 'participantId'],
        [lastActivityExpression, 'lastActiveAt'],
      ],
      where: {
        ...completedMatchFilter,
        player1Id: { [Op.in]: participantIds },
      },
      group: ['player1Id'],
      raw: true,
    }),
    Match.findAll({
      attributes: [
        ['player2Id', 'participantId'],
        [lastActivityExpression, 'lastActiveAt'],
      ],
      where: {
        ...completedMatchFilter,
        player2Id: { [Op.in]: participantIds },
      },
      group: ['player2Id'],
      raw: true,
    }),
  ]);

  const lastActiveAtByParticipantId = new Map();
  mergeLastActiveRows(lastActiveAtByParticipantId, player1Rows);
  mergeLastActiveRows(lastActiveAtByParticipantId, player2Rows);
  return lastActiveAtByParticipantId;
}

async function findSeedConflict(tournamentId, seed, options: any = {}) {
  if (seed == null) {
    return null;
  }

  const where: any = {
    tournamentId,
    seed,
  };

  if (options.excludeParticipantId != null) {
    where.id = { [Op.ne]: options.excludeParticipantId };
  }

  return Participant.findOne({ where, transaction: options.transaction });
}

async function getTournaments(req, res) {
  try {
    const pagination = getPagination(req.query);
    if (pagination.error) {
      return res.status(400).json({ error: pagination.error });
    }

    const { rows: tournaments, count } = await Tournament.findAndCountAll({
      where: getTournamentFilters(req.query),
      order: [['id', 'DESC']],
      limit: pagination.limit,
      offset: pagination.offset,
    });

    setPaginationHeaders(res, count, pagination.page, pagination.limit);
    res.json(tournaments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function createTournament(req, res) {
  try {
    const { type, size } = req.body;

    if (requiresPowerOfTwoSize(type) && !isPowerOfTwo(size)) {
      return res.status(400).json({
        error: 'Elimination tournament `size` must be a power of 2 (2, 4, 8, 16...',
      });
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

async function getTournament(req, res) {
  try {
    const tournament = await Tournament.findByPk(req.params.id);

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    res.json(tournament);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function addParticipant(req, res) {
  try {
    const memberId = req.body.member_id;
    const tournamentId = req.params.id;
    const parsedSeed = parseSeedValue(req.body.seed);

    if (!memberId || !tournamentId) {
      return res.status(400).json({ error: 'IDs not set' });
    }

    if (parsedSeed.error) {
      return res.status(400).json({ error: parsedSeed.error });
    }

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.status !== PENDING_TOURNAMENT_STATUS) {
      return res.status(409).json({ error: 'Cannot add participants unless the tournament is pending' });
    }

    if (BRACKET_SIZE_TOURNAMENT_TYPES.has(tournament.type)) {
      const participants = await Participant.count({
        where: { tournamentId },
      });

      if (hasReachedParticipantLimit(tournament, participants)) {
        return res.status(409).json({ error: 'Tournament player limit already met' });
      }
    }

    if (parsedSeed.provided && BRACKET_SIZE_TOURNAMENT_TYPES.has(tournament.type) && parsedSeed.value > tournament.size) {
      return res.status(400).json({ error: 'Participant seed cannot exceed the tournament size' });
    }

    if (parsedSeed.provided) {
      const seedConflict = await findSeedConflict(tournament.id, parsedSeed.value);
      if (seedConflict) {
        return res.status(409).json({ error: 'Participant seed is already assigned in this tournament' });
      }
    }

    await Participant.create({ memberId, tournamentId, seed: parsedSeed.value });

    res.status(201).json({ message: 'Participant added to the tournament' });
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      if (error.fields?.seed || error.fields?.includes?.('seed')) {
        res.status(409).json({ error: 'Participant seed is already assigned in this tournament' });
      } else {
        res.status(409).json({ error: 'Member is already a participant in this tournament' });
      }
    } else {
      res.status(500).json({ error: error.message });
    }
  }
}

async function getParticipants(req, res) {
  try {
    const pagination = getPagination(req.query);
    if (pagination.error) {
      return res.status(400).json({ error: pagination.error });
    }

    const tournament = await Tournament.findByPk(req.params.id);

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const { rows: participants, count } = await Participant.findAndCountAll({
      where: { tournamentId: tournament.id },
      include: { model: Member, as: 'member' },
      order: getParticipantListOrder(),
      limit: pagination.limit,
      offset: pagination.offset,
    });

    setPaginationHeaders(res, count, pagination.page, pagination.limit);
    res.json(participants);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function updateParticipant(req, res) {
  try {
    const unsupportedFields = Object.keys(req.body).filter((field) => !ALLOWED_PARTICIPANT_UPDATE_FIELDS.includes(field));
    if (unsupportedFields.length > 0) {
      return res.status(400).json({ error: `Unsupported participant fields: ${unsupportedFields.join(', ')}` });
    }

    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: 'At least one participant field is required' });
    }

    const parsedSeed = parseSeedValue(req.body.seed);
    if (parsedSeed.error) {
      return res.status(400).json({ error: parsedSeed.error });
    }

    const tournament = await Tournament.findByPk(req.params.id);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.status !== PENDING_TOURNAMENT_STATUS) {
      return res.status(409).json({ error: 'Participant seeding can only be updated while the tournament is pending' });
    }

    const participant = await Participant.findOne({
      where: {
        id: req.params.participant_id,
        tournamentId: tournament.id,
      },
      include: { model: Member, as: 'member' },
    });

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    if (parsedSeed.provided && BRACKET_SIZE_TOURNAMENT_TYPES.has(tournament.type) && parsedSeed.value > tournament.size) {
      return res.status(400).json({ error: 'Participant seed cannot exceed the tournament size' });
    }

    if (parsedSeed.provided) {
      const seedConflict = await findSeedConflict(tournament.id, parsedSeed.value, {
        excludeParticipantId: participant.id,
      });

      if (seedConflict) {
        return res.status(409).json({ error: 'Participant seed is already assigned in this tournament' });
      }
    }

    const updatedParticipant = await participant.update({
      seed: parsedSeed.value,
    });

    res.json(updatedParticipant);
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      res.status(409).json({ error: 'Participant seed is already assigned in this tournament' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
}

async function getStandings(req, res) {
  try {
    const tournament = await Tournament.findByPk(req.params.id, {
      include: [
        { model: Participant, as: 'participants', include: { model: Member, as: 'member' } },
        { model: Match, as: 'matches' },
      ],
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    res.json(getStandingsForTournament(tournament, tournament.participants, tournament.matches));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function updateTournament(req, res) {
  try {
    const unsupportedFields = getUnsupportedUpdateFields(req.body);
    if (unsupportedFields.length > 0) {
      return res.status(400).json({
        error: `Unsupported tournament fields: ${unsupportedFields.join(', ')}`,
      });
    }

    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: 'At least one tournament field is required' });
    }

    const tournament = await Tournament.findByPk(req.params.id);

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const updates: any = {};

    if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
      updates.name = req.body.name;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      if (req.body.status !== ARCHIVED_TOURNAMENT_STATUS) {
        return res.status(400).json({ error: 'Tournament status can only be updated to archived' });
      }

      if (!canArchiveTournament(tournament)) {
        return res.status(409).json({ error: 'Cannot archive an in-progress tournament' });
      }

      updates.status = ARCHIVED_TOURNAMENT_STATUS;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'size')) {
      if (!BRACKET_SIZE_TOURNAMENT_TYPES.has(tournament.type)) {
        return res.status(400).json({ error: 'Tournament size can only be updated for elimination tournaments' });
      }

      if (tournament.status !== PENDING_TOURNAMENT_STATUS) {
        return res.status(409).json({ error: 'Tournament size can only be updated while the tournament is pending' });
      }

      if (!isPowerOfTwo(req.body.size)) {
        return res.status(400).json({
          error: 'Elimination tournament `size` must be a power of 2 (2, 4, 8, 16...',
        });
      }

      const participantCount = await Participant.count({
        where: { tournamentId: tournament.id },
      });

      if (req.body.size < participantCount) {
        return res.status(409).json({ error: 'Tournament size cannot be smaller than the current participant count' });
      }

      updates.size = req.body.size;
    }

    const updatedTournament = await tournament.update(updates);

    res.json(updatedTournament);
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      res.status(409).json({ error: 'Tournament must have a unique name' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
}

async function startTournament(req, res) {
  try {
    const outcome = await sequelize.transaction(async (transaction) => {
      const tournament = await Tournament.findByPk(req.params.id, {
        include: { model: Participant, as: 'participants' },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!tournament) {
        return { status: 404, body: { error: 'Tournament not found' } };
      }

      if (tournament.status !== PENDING_TOURNAMENT_STATUS) {
        return { status: 400, body: { error: 'Tournament has already been started' } };
      }

      if (requiresFullBracketBeforeStart(tournament.type) && tournament.participants.length !== tournament.size) {
        return { status: 400, body: { error: 'Double elimination tournaments require a full field before start' } };
      }

      const [updatedCount] = await Tournament.update(
        { status: IN_PROGRESS_TOURNAMENT_STATUS },
        {
          where: {
            id: tournament.id,
            status: PENDING_TOURNAMENT_STATUS,
          },
          transaction,
        },
      );

      if (updatedCount !== 1) {
        return { status: 400, body: { error: 'Tournament has already been started' } };
      }

      const generator = MATCH_GENERATORS[tournament.type];
      if (!generator) {
        throw new Error('Invalid tournament type');
      }

      const matches = generator(sortParticipantsForSetup(tournament.participants));

      if (matches) {
        await Match.bulkCreate(getTournamentMatchesPayload(tournament, matches), { transaction });
      }

      return { status: 200, body: { message: 'Tournament started, matches generated' } };
    });

    res.status(outcome.status).json(outcome.body);
  } catch (error) {
    if (error instanceof TimeoutError || isSqliteBusyError(error)) {
      res.status(400).json({ error: 'Tournament has already been started' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
}

async function endTournament(req, res) {
  try {
    const tournament = await Tournament.findByPk(req.params.id, {
      include: [
        { model: Participant, as: 'participants', include: { model: Member, as: 'member' } },
        { model: Match, as: 'matches' },
      ],
    });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.type !== 'league') {
      return res.status(400).json({ error: 'Cannot end a non-league tournament' });
    }

    if (tournament.status === 'completed') {
      return res.status(200).json({ message: 'Tournament already completed' });
    }

    if (tournament.status !== IN_PROGRESS_TOURNAMENT_STATUS) {
      return res.status(400).json({ error: 'Cannot end an unstarted tournament' });
    }

    const incompleteMatches = tournament.matches.filter((match) => match.winnerId == null);
    if (incompleteMatches.length > 0) {
      return res.status(409).json({ error: 'Cannot end a league before all scheduled fixtures are completed' });
    }

    const standings = getStandingsForTournament(tournament, tournament.participants, tournament.matches);
    const winner = standings.standings[0];

    await tournament.update({
      status: 'completed',
      winnerId: getLeagueWinnerParticipantId(winner),
    });

    res.status(200).json({ message: 'Tournament completed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getLatestTournament(req, res) {
  try {
    const latestTournament = await Tournament.findOne({
      where: {
        status: { [Op.ne]: ARCHIVED_TOURNAMENT_STATUS },
      },
      order: [['id', 'DESC']],
    });

    if (!latestTournament) {
      return res.status(404).json({ error: 'No active tournaments found' });
    }

    res.json(latestTournament);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}

async function resetTournament(req, res) {
  try {
    const outcome = await sequelize.transaction(async (transaction) => {
      const tournament = await Tournament.findByPk(req.params.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!tournament) {
        return { status: 404, body: { error: 'Tournament not found' } };
      }

      if (tournament.status === IN_PROGRESS_TOURNAMENT_STATUS) {
        return { status: 409, body: { error: 'Cannot reset an in-progress tournament' } };
      }

      await Match.destroy({
        where: { tournamentId: tournament.id },
        transaction,
      });

      await Participant.update(
        { elo: INITIAL_PARTICIPANT_ELO },
        {
          where: { tournamentId: tournament.id },
          transaction,
        },
      );

      await tournament.update({
        status: PENDING_TOURNAMENT_STATUS,
        winnerId: null,
      }, { transaction });

      return { status: 200, body: { message: 'Tournament reset' } };
    });

    res.status(outcome.status).json(outcome.body);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}

async function deleteTournament(req, res) {
  try {
    const outcome = await sequelize.transaction(async (transaction) => {
      const tournament = await Tournament.findByPk(req.params.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!tournament) {
        return { status: 404, body: { error: 'Tournament not found' } };
      }

      if (tournament.status === IN_PROGRESS_TOURNAMENT_STATUS) {
        return { status: 409, body: { error: 'Cannot delete an in-progress tournament' } };
      }

      await Match.destroy({
        where: { tournamentId: tournament.id },
        transaction,
      });

      await Participant.destroy({
        where: { tournamentId: tournament.id },
        transaction,
      });

      await tournament.destroy({ transaction });

      return { status: 200, body: { message: 'Tournament deleted' } };
    });

    res.status(outcome.status).json(outcome.body);
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

    if (tournament.status !== IN_PROGRESS_TOURNAMENT_STATUS) {
      return res.status(404).json({ error: 'No tournaments in progress' });
    }

    const participants = await Participant.findAll({
      where: { tournamentId: tournament.id },
      include: { model: Member, as: 'member' },
    });
    const participantIds = participants.map((participant) => participant.id);
    const lastActiveAtByParticipantId = await getLastActiveAtByParticipantId(tournament.id, participantIds);
    const currentDate = new Date();

    const updatedParticipants = [];

    for (const participant of participants) {
      const lastActiveAt = lastActiveAtByParticipantId.get(participant.id);
      if (!lastActiveAt) {
        continue;
      }

      const oldElo = participant.elo;
      const updatedParticipant = applyDecay(participant, lastActiveAt, currentDate);
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
  getTournaments,
  createTournament,
  getTournament,
  updateTournament,
  resetTournament,
  deleteTournament,
  addParticipant,
  getParticipants,
  updateParticipant,
  getStandings,
  startTournament,
  endTournament,
  getLatestTournament,
  decayElo,
  getLastActiveAtByParticipantId,
};
