const { faker } = require('@faker-js/faker');
const client = require('./client');

const memberNames = Array.from({ length: 8 }, () => faker.name.fullName());

async function createMemberIfNotExists(name) {
  try {
    const existingMember = await client.searchMembers(name);

    if (existingMember.length > 0) {
      return existingMember[0];
    }
    return await client.createMember(name);
  } catch (error) {
    console.error(`Error creating member: ${error.message}`);
    throw error;
  }
}

function displayMatchResults(matches) {
  console.log(matches);
  console.log('\nMatch results:');
  console.log('------------------------------------');
  matches.forEach((match) => {
    console.log(
      `Match ID: ${match.id} | ${match.player1.Member.name} (${match.player1.Member.elo}) vs ${match.player2.Member.name} (${match.player2.Member.elo}) | Winner: ${match.winner.Member.name} (${match.winner.Member.elo})`
    );
  });
  console.log('------------------------------------\n');
}

async function main() {
  try {
    const members = await Promise.all(memberNames.map(createMemberIfNotExists)).catch(error => {
      console.log(error.message);
    });
    const tournament = await client.createTournament('Demo Tournament', 'single_elimination');
    const tournamentId = tournament.id;
    await Promise.all(members.map((member) => client.addParticipant(tournamentId, member.id))).catch(error => {
      console.log(error.message);
    });

    await client.startTournament(tournamentId);

    let tournamentCompleted = false;

    while (!tournamentCompleted) {
      // Get the matches with pending status for the tournament
      const pendingMatches = await client.getMatches(tournamentId, { status: 'pending' });

      if (pendingMatches.length === 0) {
        // No pending matches, the tournament is complete
        tournamentCompleted = true;
        break;
      } else {
        console.log('Advance round...');
      }

      // Simulate the matches and update winners
      for (const match of pendingMatches) {
        const winnerId = Math.random() > 0.5 ? match.player1.id : match.player2.id;
        await client.updateMatch(tournamentId, match.id, winnerId);
        console.log(`Match ${match.id} completed. Winner: ${winnerId}`);
      }
    }

    console.log('Tournament completed');

    // Retrieve all matches and display the results
    const allMatches = await client.getMatches(tournamentId);
    displayMatchResults(allMatches);
  } catch (error) {
    console.error(`Error simulating tournament: ${error.message}`);
    return;
  }
}

main();
