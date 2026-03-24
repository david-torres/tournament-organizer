export {};

const { loadSourceModule } = require('../runtime/loadSourceModule');
const { Match } = loadSourceModule('models');
const {
  buildDoubleEliminationPlan,
  generateSwissMatches,
  getDoubleEliminationMatchId,
} = require('./matchGenerators');
const { getStandingsForTournament } = require('./standings');
const { isMatchCompleted } = require('./matchState');

async function completeTournament(tournament, winnerParticipantId, options: any = {}) {
  await tournament.update({
    status: 'completed',
    winnerId: winnerParticipantId,
  }, options);
}

async function advanceSingleElimination(tournament, options: any = {}) {
  try {
    const { transaction } = options;
    const matches = await Match.findAll({
      where: {
        tournamentId: tournament.id,
      },
      order: [['round', 'ASC']],
      transaction,
    });

    const latestRound = matches[matches.length - 1].round;
    const currentRoundMatches = matches.filter((match) => match.round === latestRound);
    const completedMatches = currentRoundMatches.filter((match) => isMatchCompleted(match));

    if (completedMatches.length === currentRoundMatches.length) {
      console.log(`All matches completed for round #${latestRound}. Advancing round.`);

      const winners = completedMatches.map((match) => match.winnerId);

      if (winners.length === 1) {
        console.log('All rounds complete.');
        await completeTournament(tournament, winners[0], options);
        return;
      }

      const nextRound = latestRound + 1;
      const newMatches = [];

      for (let index = 0; index < winners.length; index += 2) {
        newMatches.push({
          round: nextRound,
          player1Id: winners[index],
          player2Id: winners[index + 1],
          tournamentId: tournament.id,
        });
      }

      await Match.bulkCreate(newMatches, { transaction });
    }
  } catch (error) {
    console.error(error);
  }
}

function getLoserParticipantId(match) {
  if (!isMatchCompleted(match) || match.player1Id == null || match.player2Id == null) {
    return null;
  }

  if (match.winnerId === match.player1Id) {
    return match.player2Id;
  }

  if (match.winnerId === match.player2Id) {
    return match.player1Id;
  }

  return null;
}

function getDoubleEliminationNodeIdForMatch(match) {
  if (!match?.bracket || match?.position == null) {
    return null;
  }

  return getDoubleEliminationMatchId(match.bracket, match.round, match.position);
}

function resolveDoubleEliminationSourceParticipantId(source, matchesByNodeId) {
  if (source.type === 'seed') {
    return null;
  }

  const sourceMatch = matchesByNodeId.get(source.matchId);
  if (!sourceMatch || !isMatchCompleted(sourceMatch)) {
    return null;
  }

  if (source.type === 'winner') {
    return sourceMatch.winnerId ?? null;
  }

  return getLoserParticipantId(sourceMatch);
}

function resolveDoubleEliminationNodePlayers(node, matchesByNodeId) {
  const playerIds = node.sources.map((source) => resolveDoubleEliminationSourceParticipantId(source, matchesByNodeId));

  if (playerIds.some((playerId) => playerId == null)) {
    return null;
  }

  return playerIds;
}

function createDoubleEliminationMatchPayload(node, playerIds, tournamentId) {
  return {
    bracket: node.bracket,
    round: node.round,
    position: node.position,
    player1Id: playerIds[0],
    player2Id: playerIds[1],
    tournamentId,
  };
}

async function advanceDoubleElimination(tournament, options: any = {}) {
  try {
    const { transaction } = options;
    const matches = await Match.findAll({
      where: {
        tournamentId: tournament.id,
      },
      order: [['id', 'ASC']],
      transaction,
    });

    if (matches.length === 0) {
      return;
    }

    const plan = buildDoubleEliminationPlan(tournament.participants.length);
    const matchesByNodeId = new Map<string, any>(
      matches
        .map((match) => [getDoubleEliminationNodeIdForMatch(match), match])
        .filter(([nodeId]) => nodeId != null),
    );

    const matchesToCreate = plan.reduce((pendingMatches, node) => {
      if ((node.bracket === 'finals' && node.round === 2) || matchesByNodeId.has(node.id)) {
        return pendingMatches;
      }

      const playerIds = resolveDoubleEliminationNodePlayers(node, matchesByNodeId);
      if (!playerIds) {
        return pendingMatches;
      }

      pendingMatches.push(createDoubleEliminationMatchPayload(node, playerIds, tournament.id));
      return pendingMatches;
    }, [] as any[]);

    if (matchesToCreate.length > 0) {
      await Match.bulkCreate(matchesToCreate, { transaction });

      matchesToCreate.forEach((match) => {
        matchesByNodeId.set(
          getDoubleEliminationMatchId(match.bracket, match.round, match.position),
          match,
        );
      });
    }

    const finalsRoundOne = plan.find((node) => node.bracket === 'finals' && node.round === 1);
    if (!finalsRoundOne) {
      return;
    }

    const finalsRoundOneMatch = matchesByNodeId.get(finalsRoundOne.id);
    if (!finalsRoundOneMatch || !isMatchCompleted(finalsRoundOneMatch)) {
      return;
    }

    const finalsParticipants = resolveDoubleEliminationNodePlayers(finalsRoundOne, matchesByNodeId);
    if (!finalsParticipants) {
      return;
    }

    const [undefeatedFinalistId, challengerFinalistId] = finalsParticipants;

    if (finalsRoundOneMatch.winnerId === undefeatedFinalistId) {
      await completeTournament(tournament, undefeatedFinalistId, options);
      return;
    }

    const finalsRoundTwo = plan.find((node) => node.bracket === 'finals' && node.round === 2);
    const finalsRoundTwoMatch = finalsRoundTwo ? matchesByNodeId.get(finalsRoundTwo.id) : null;

    if (!finalsRoundTwo && challengerFinalistId != null) {
      await completeTournament(tournament, challengerFinalistId, options);
      return;
    }

    if (!finalsRoundTwoMatch) {
      await Match.create(
        createDoubleEliminationMatchPayload(finalsRoundTwo, finalsParticipants, tournament.id),
        { transaction },
      );
      return;
    }

    if (isMatchCompleted(finalsRoundTwoMatch)) {
      await completeTournament(tournament, finalsRoundTwoMatch.winnerId, options);
    }
  } catch (error) {
    console.error(error);
  }
}

async function advanceRoundRobin(tournament, options: any = {}) {
  try {
    const { transaction } = options;
    const matches = await Match.findAll({
      where: {
        tournamentId: tournament.id,
      },
      order: [['round', 'DESC']],
      transaction,
    });

    const latestRound = matches[0].round;
    const totalRounds =
      tournament.participants.length % 2 === 0
        ? tournament.participants.length - 1
        : tournament.participants.length;

    const completedMatches = matches.filter((match) => isMatchCompleted(match));

    if (completedMatches.length === matches.length) {
      console.log(`All matches completed for round #${latestRound}.`);

      if (latestRound === totalRounds) {
        console.log('All rounds complete. Tournament finished.');
        const standings = getStandingsForTournament(tournament, tournament.participants, matches);
        await completeTournament(tournament, standings.standings[0]?.participantId ?? null, options);
      }
    }
  } catch (error) {
    console.error(error);
  }
}

async function advanceLeague(tournament, options: any = {}) {
  try {
    const { transaction } = options;
    const matches = await Match.findAll({
      where: {
        tournamentId: tournament.id,
      },
      order: [['round', 'ASC'], ['id', 'ASC']],
      transaction,
    });

    if (matches.length === 0) {
      return;
    }

    const completedMatches = matches.filter((match) => isMatchCompleted(match));

    if (completedMatches.length === matches.length) {
      const standings = getStandingsForTournament(tournament, tournament.participants, matches);
      await completeTournament(tournament, standings.standings[0]?.participantId ?? null, options);
    }
  } catch (error) {
    console.error(error);
  }
}

async function advanceSwiss(tournament, options: any = {}) {
  try {
    const { transaction } = options;
    const matches = await Match.findAll({
      where: { tournamentId: tournament.id },
      order: [['round', 'DESC']],
      transaction,
    });

    const participants = tournament.participants;
    const latestRound = matches.length > 0 ? matches[0].round : 0;
    const currentRoundMatches = matches.filter((match) => match.round === latestRound);
    const completedMatches = currentRoundMatches.filter((match) => isMatchCompleted(match));

    if (completedMatches.length === currentRoundMatches.length) {
      const maxRounds = Math.ceil(Math.log2(participants.length)) + 1;

      if (latestRound >= maxRounds) {
        const standings = getStandingsForTournament(tournament, participants, matches);
        await completeTournament(tournament, standings.standings[0]?.participantId ?? null, options);
        return;
      }

      const newMatches = generateSwissMatches(participants, matches);
      const generatedAt = new Date();
      await Match.bulkCreate(
        newMatches.map((match) => ({
          ...match,
          winnerId: match.player2Id === null ? match.player1Id : match.winnerId ?? null,
          resultType: match.player2Id === null ? 'bye' : null,
          completedAt: match.player2Id === null ? generatedAt : null,
          tournamentId: tournament.id,
        })),
        { transaction },
      );
    }
  } catch (error) {
    console.error(error);
  }
}

module.exports = {
  advanceDoubleElimination,
  advanceSingleElimination,
  advanceRoundRobin,
  advanceLeague,
  advanceSwiss,
};
