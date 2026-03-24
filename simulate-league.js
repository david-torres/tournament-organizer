/**
 * simulate-league.js
 * 
 * simulate-league.js is a script that creates a league tournament with 8 participants and simulates the tournament until completion.
 */

const { faker } = require('@faker-js/faker');
const client = require('./client');
const { createMemberIfNotExists } = require('./utils/simulation');

const TOURNAMENT_TYPE = 'league';
const PLAYER_COUNT = 8;

const memberNames = Array.from({ length: PLAYER_COUNT }, () => faker.name.fullName());

function displayMatchResults(matches) {
    console.log('\nMatch results:');
    console.log('------------------------------------');
    matches.forEach((match) => {
        console.log(
            `Match ID: ${match.id} | ${match.player1.member.name} vs ${match.player2.member.name} | Winner: ${match.winner.member.name} (${match.winner.member.elo})`
        );
    });
    console.log('------------------------------------\n');
}

async function main() {
    try {
        const tournament = await client.createTournament(`Demo League ${Math.round(Math.random() * 10000)}`, TOURNAMENT_TYPE, PLAYER_COUNT);
        const tournamentId = tournament.id;
        console.log(`Created tournament: ${tournament.name} with ID: ${tournament.id}`);

        const members = await Promise.all(
            memberNames.map((name) => createMemberIfNotExists(client, name))
        );

        await Promise.all(members.map((member) => client.addParticipant(tournamentId, member.id))).catch(error => {
            console.log(error.message);
        });

        await client.startTournament(tournamentId);

        const scheduledMatches = await client.getMatches(tournamentId, { status: 'pending' });
        console.log(`Generated ${scheduledMatches.length} league fixtures`);

        await Promise.all(scheduledMatches.map((match) => {
            const winnerId = Math.random() < 0.5 ? match.player1.id : match.player2.id;
            const winnerName = winnerId === match.player1.id ? match.player1.member.name : match.player2.member.name;
            console.log(`Match ID: ${match.id} | ${match.player1.member.name} vs ${match.player2.member.name} | Winner: ${winnerName}`);
            return client.updateMatch(tournamentId, match.id, winnerId);
        }));

        console.log(`Tournament ${tournamentId} completed`);

        // Get the final standings, list all participants in order of their Elo score
        const participantsFinal = await client.getParticipants(tournamentId);
        // sort the participants by their Elo score
        participantsFinal.sort((a, b) => b.elo - a.elo);

        console.log('\nFinal standings:');
        console.log('------------------------------------');
        participantsFinal.forEach((participant) => {
            console.log(`${participant.member.name} (${participant.elo})`);
        });

    } catch (error) {
        console.error(`Error: ${error.message}`);
    }
}

main();
