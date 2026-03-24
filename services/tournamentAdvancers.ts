export {};

const { loadSourceModule } = require('../runtime/loadSourceModule');
const { Match } = loadSourceModule('models');
const { generateSwissMatches } = require('./matchGenerators');
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
  advanceSingleElimination,
  advanceRoundRobin,
  advanceLeague,
  advanceSwiss,
};
