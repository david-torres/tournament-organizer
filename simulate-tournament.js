const { faker } = require('@faker-js/faker');
const client = require('./client');
const { createMemberIfNotExists, displayMatchResults } = require('./utils/simulation');

const TOURNAMENT_TYPE = process.argv[2] || 'single_elimination'; // valid values: single_elimination, round_robin, swiss
const PLAYER_COUNT = 8;

const memberNames = Array.from({ length: PLAYER_COUNT }, () => faker.name.fullName());

function displayStandings(matches, participants) {
  // Calculate wins for each participant
  const standings = participants.map(participant => {
    const wins = matches.filter(m => m.winnerId === participant.id).length;
    return {
      name: participant.member.name,
      wins,
      elo: participant.member.elo
    };
  });

  // Sort by wins (descending) then by Elo (descending)
  standings.sort((a, b) => b.wins - a.wins || b.elo - a.elo);

  console.log('\nFinal Standings:');
  console.log('------------------------------------');
  standings.forEach((player, index) => {
    console.log(`${index + 1}. ${player.name} - ${player.wins} wins (Elo: ${player.elo})`);
  });
  console.log('------------------------------------\n');
}

async function main() {
  try {
    const tournament = await client.createTournament(`Demo Tournament ${Math.round(Math.random() * 10000)}`, TOURNAMENT_TYPE, PLAYER_COUNT);
    const tournamentId = tournament.id;
    console.log(`Created tournament: ${tournament.name} with ID: ${tournament.id}`);

    const members = await Promise.all(
      memberNames.map((name) => createMemberIfNotExists(client, name))
    );

    await Promise.all(members.map((member) => client.addParticipant(tournamentId, member.id)));

    console.log('Starting tournament...');
    await client.startTournament(tournamentId);

    let tournamentCompleted = false;
    let roundNumber = 1;
    const maxRounds = Math.ceil(Math.log2(PLAYER_COUNT)) + 1;

    while (!tournamentCompleted) {
      // Get the matches with pending status for the tournament
      const pendingMatches = await client.getMatches(tournamentId, { status: 'pending' });

      if (pendingMatches.length === 0) {
        if (TOURNAMENT_TYPE === 'swiss' && roundNumber < maxRounds) {
          console.log(`Round ${roundNumber} completed. Moving to next round...`);
          roundNumber++;
          continue;
        }
        // No pending matches and all rounds complete, the tournament is finished
        tournamentCompleted = true;
        break;
      }

      console.log(`\nSimulating Round ${roundNumber}...`);

      // Simulate the matches and update winners
      for (const match of pendingMatches) {
        // If player2 is null (bye), player1 automatically wins
        if (!match.player2) {
          await client.updateMatch(tournamentId, match.id, match.player1.id);
          console.log(`Match ${match.id}: ${match.player1.member.name} received a bye`);
          continue;
        }

        // Otherwise, randomly determine winner
        const player = Math.random() > 0.5 ? match.player1 : match.player2;
        await client.updateMatch(tournamentId, match.id, player.id);
        console.log(`Match ${match.id}: ${match.player1.member.name} vs ${match.player2.member.name} - Winner: ${player.member.name}`);
      }
    }

    console.log('\nTournament completed!');

    // Retrieve all matches and display the results
    const allMatches = await client.getMatches(tournamentId);
    displayMatchResults(allMatches);

    // For Swiss tournaments, also display final standings
    if (TOURNAMENT_TYPE === 'swiss') {
      const participants = await client.getParticipants(tournamentId);
      displayStandings(allMatches, participants);
    }
  } catch (error) {
    console.error(`Error simulating tournament: ${error.message}`);
    return;
  }
}

main();