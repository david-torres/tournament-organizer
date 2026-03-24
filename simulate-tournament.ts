export {};

const { faker } = require('@faker-js/faker');
const client = require('./client');
const { createMemberIfNotExists, displayMatchResults } = require('./utils/simulation');
const {
  DEFAULT_LADDER_MATCH_COUNT,
  SIMULATED_TOURNAMENT_TYPES,
  getDefaultPlayerCount,
} = require('./utils/simulationConfig');

function formatTournamentTypeLabel(type) {
  return type
    .split('_')
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function getRandomParticipantPair(participants) {
  const randomizedParticipants = [...participants].sort(() => Math.random() - 0.5);
  return randomizedParticipants.slice(0, 2);
}

function displayStandingsTable(standingsResponse) {
  console.log('\nStandings:');
  console.log('------------------------------------');
  standingsResponse.standings.forEach((record) => {
    const summary = [
      `${record.rank}. ${record.memberName}`,
      `${record.points} pts`,
      `${record.wins}W-${record.losses}L`,
    ];

    if (record.draws > 0) {
      summary.push(`${record.draws}D`);
    }

    if (record.currentElo != null) {
      summary.push(`Elo: ${record.currentElo}`);
    }

    if (record.isWinner) {
      summary.push('WINNER');
    }

    console.log(summary.join(' | '));
  });
  console.log('------------------------------------');
  console.log(`Tie-breaks: ${standingsResponse.tieBreakOrder.join(', ')}`);
  console.log('------------------------------------\n');
}

async function createSimulationMembers(playerCount) {
  const simulationRunId = `${Date.now()}-${Math.round(Math.random() * 10000)}`;
  const memberNames = Array.from(
    { length: playerCount },
    (_, index) => `${faker.name.fullName()} Sim ${simulationRunId}-${index + 1}`,
  );

  return Promise.all(memberNames.map((name) => createMemberIfNotExists(client, name)));
}

async function simulateScheduledTournament(tournamentId) {
  let roundNumber = 1;

  while (true) {
    const tournament = await client.getTournament(tournamentId);
    if (tournament.status === 'completed') {
      break;
    }

    const pendingMatches = await client.getMatches(tournamentId, { status: 'pending' });
    if (pendingMatches.length === 0) {
      throw new Error(`Tournament ${tournamentId} is still ${tournament.status} but has no pending matches`);
    }

    console.log(`\nSimulating Round ${roundNumber}...`);

    for (const match of pendingMatches) {
      if (!match.player2) {
        await client.updateMatch(tournamentId, match.id, match.player1.id);
        console.log(`Match ${match.id}: ${match.player1.member.name} received a bye`);
        continue;
      }

      const winner = Math.random() > 0.5 ? match.player1 : match.player2;
      await client.updateMatch(tournamentId, match.id, winner.id);
      console.log(`Match ${match.id}: ${match.player1.member.name} vs ${match.player2.member.name} - Winner: ${winner.member.name}`);
    }

    roundNumber += 1;
  }
}

async function simulateLadderTournament(tournamentId, matchCount = DEFAULT_LADDER_MATCH_COUNT) {
  const participants = await client.getParticipants(tournamentId);

  for (let matchNumber = 1; matchNumber <= matchCount; matchNumber += 1) {
    const [participant1, participant2] = getRandomParticipantPair(participants);
    const createdMatch = await client.createMatch(tournamentId, participant1.id, participant2.id);
    const winner = Math.random() > 0.5 ? createdMatch.player1 : createdMatch.player2;

    await client.updateMatch(tournamentId, createdMatch.id, winner.id);
    console.log(`Ladder Match ${matchNumber}: ${createdMatch.player1.member.name} vs ${createdMatch.player2.member.name} - Winner: ${winner.member.name}`);
  }
}

async function simulateTournament(type, options: any = {}) {
  const playerCount = options.playerCount || getDefaultPlayerCount(type);

  try {
    const tournament = await client.createTournament(`Demo ${formatTournamentTypeLabel(type)} ${Math.round(Math.random() * 10000)}`, type, playerCount);
    const tournamentId = tournament.id;
    console.log(`Created tournament: ${tournament.name} with ID: ${tournament.id}`);

    const members = await createSimulationMembers(playerCount);

    await Promise.all(members.map((member) => client.addParticipant(tournamentId, member.id)));

    console.log('Starting tournament...');
    await client.startTournament(tournamentId);

    if (type === 'ladder') {
      await simulateLadderTournament(tournamentId);
    } else {
      await simulateScheduledTournament(tournamentId);
    }

    const latestTournament = await client.getTournament(tournamentId);
    console.log(`\nTournament status: ${latestTournament.status}`);

    const allMatches = await client.getMatches(tournamentId);
    displayMatchResults(allMatches);

    const standings = await client.getStandings(tournamentId);
    displayStandingsTable(standings);
  } catch (error) {
    console.error(`Error simulating tournament: ${error.message}`);
    throw error;
  }
}

async function main() {
  const tournamentType = process.argv[2] || 'single_elimination';

  if (!SIMULATED_TOURNAMENT_TYPES.includes(tournamentType)) {
    console.error(`Unsupported tournament type "${tournamentType}". Valid values: ${SIMULATED_TOURNAMENT_TYPES.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  await simulateTournament(tournamentType);
}

if (require.main === module) {
  main().catch(() => {
    process.exitCode = 1;
  });
}

module.exports = {
  simulateTournament,
};
