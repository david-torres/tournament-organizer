const { Match } = require('../models');
const { generateSwissMatches } = require('./matchGenerators');

async function advanceSingleElimination(tournament) {
  try {
    const matches = await Match.findAll({
      where: {
        tournamentId: tournament.id,
      },
      order: [['round', 'ASC']],
    });

    const latestRound = matches[matches.length - 1].round;
    const currentRoundMatches = matches.filter((match) => match.round === latestRound);
    const completedMatches = currentRoundMatches.filter((match) => match.winnerId !== null);

    if (completedMatches.length === currentRoundMatches.length) {
      console.log(`All matches completed for round #${latestRound}. Advancing round.`);

      const winners = completedMatches.map((match) => match.winnerId);

      if (winners.length === 1) {
        console.log('All rounds complete.');
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
          tournamentId: tournament.id,
        };
        newMatches.push(match);
      }

      await Match.bulkCreate(newMatches);
    }
  } catch (error) {
    console.error(error);
  }
}

async function advanceRoundRobin(tournament) {
  try {
    const matches = await Match.findAll({
      where: {
        tournamentId: tournament.id,
      },
      order: [['round', 'DESC']],
    });

    const latestRound = matches[0].round;
    const totalRounds =
      tournament.participants.length % 2 === 0
        ? tournament.participants.length - 1
        : tournament.participants.length;

    const completedMatches = matches.filter((match) => match.winnerId !== null);

    if (completedMatches.length === matches.length) {
      console.log(`All matches completed for round #${latestRound}.`);

      if (latestRound === totalRounds) {
        console.log('All rounds complete. Tournament finished.');
        await tournament.update({ status: 'completed' });
      }
    }
  } catch (error) {
    console.error(error);
  }
}

async function advanceSwiss(tournament) {
  try {
    const matches = await Match.findAll({
      where: { tournamentId: tournament.id },
      order: [['round', 'DESC']],
    });

    const participants = tournament.participants;
    const latestRound = matches.length > 0 ? matches[0].round : 0;
    const currentRoundMatches = matches.filter((m) => m.round === latestRound);
    const completedMatches = currentRoundMatches.filter((m) => m.winnerId !== null);

    if (completedMatches.length === currentRoundMatches.length) {
      const maxRounds = Math.ceil(Math.log2(participants.length)) + 1;

      if (latestRound >= maxRounds) {
        const playerScores = participants.map((p) => ({
          participant: p,
          wins: matches.filter((m) => m.winnerId === p.id).length,
        }));

        playerScores.sort((a, b) => b.wins - a.wins || b.participant.elo - a.participant.elo);
        await tournament.update({
          status: 'completed',
          winnerId: playerScores[0].participant.memberId,
        });
        return;
      }

      const newMatches = generateSwissMatches(participants, matches);
      await Match.bulkCreate(
        newMatches.map((match) => ({
          ...match,
          tournamentId: tournament.id,
        })),
      );
    }
  } catch (error) {
    console.error(error);
  }
}

module.exports = {
  advanceSingleElimination,
  advanceRoundRobin,
  advanceSwiss,
};

