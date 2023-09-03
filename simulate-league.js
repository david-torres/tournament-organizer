/**
 * simulate-league.js
 * 
 * simulate-league.js is a script that creates a league tournament with 8 participants and simulates the tournament until completion.
 */

const { faker } = require('@faker-js/faker');
const client = require('./client');

const TOURNAMENT_TYPE = 'league';
const PLAYER_COUNT = 8;

const memberNames = Array.from({ length: PLAYER_COUNT }, () => faker.name.fullName());

async function createMemberIfNotExists(name) {
    try {
        const existingMember = await client.searchMembers(name);

        if ('rows' in existingMember && existingMember['rows'].length > 0) {
            console.log(`Fetched member ${name}`);
            return existingMember['rows'][0];
        }

        console.log(`Created member ${name}`);
        return await client.createMember(name);
    } catch (error) {
        console.error(`Error creating member: ${error.message}`);
        throw error;
    }
}

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

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

async function main() {
    try {
        const tournament = await client.createTournament(`Demo League ${Math.round(Math.random() * 10000)}`, TOURNAMENT_TYPE, PLAYER_COUNT);
        const tournamentId = tournament.id;
        console.log(`Created tournament: ${tournament.name} with ID: ${tournament.id}`);

        const members = await Promise.all(memberNames.map(createMemberIfNotExists)).catch(error => {
            console.log(error.message);
        });

        await Promise.all(members.map((member) => client.addParticipant(tournamentId, member.id))).catch(error => {
            console.log(error.message);
        });

        await client.startTournament(tournamentId);

        let tournamentCompleted = false;

        while (!tournamentCompleted) {
            // create a random number of matches between (10 and 20)
            const matchCount = Math.floor(Math.random() * 10) + 10;

            // randomly select two participants to play against each other
            const participants = await client.getParticipants(tournamentId);
            const participantIds = participants.map((participant) => participant.id);

            // Duplicate the array to allow each participant to play more than once
            let doubledParticipantIds = [...participantIds, ...participantIds];

            // Shuffle the array
            shuffle(doubledParticipantIds);

            // Generate the matches
            let matchParticipants = [];
            for (let i = 0; matchParticipants.length < matchCount;) {
                // Check if i or i+1 are out of bounds
                if (i >= doubledParticipantIds.length - 1) {
                    // Shuffle the remaining elements and reset i
                    shuffle(doubledParticipantIds.slice(i));
                    i = 0;
                    continue;
                }

                // Ensure that a participant never plays themselves
                if (doubledParticipantIds[i] !== doubledParticipantIds[i + 1]) {
                    matchParticipants.push([doubledParticipantIds[i], doubledParticipantIds[i + 1]]);
                    i += 2; // Increment by 2 to skip the used pair
                } else {
                    // If a participant is paired with themselves, shuffle the remaining elements and try again
                    const remaining = doubledParticipantIds.slice(i);
                    shuffle(remaining);
                    doubledParticipantIds.splice(i, remaining.length, ...remaining);
                }
            }

            // create the matches
            console.log(`Creating ${matchCount} matches`);
            const matches = await Promise.all(Array.from({ length: matchCount }, async (_, index) => {
                // fetch two participants from the list
                const match = matchParticipants[index];
                const player1Id = match[0];
                const player2Id = match[1];

                console.log(`Creating match: ${player1Id} vs ${player2Id}`);
                return client.createMatch(tournamentId, player1Id, player2Id)
            })).then((matches) => {
                return matches;
            }).catch(error => {
                console.log(error.message);
            });

            // Simulate the matches
            const matchResults = await Promise.all(matches.map((match) => {
                const winnerId = Math.random() < 0.5 ? match.player1.id : match.player2.id;
                // get the winning member name
                const winnerName = winnerId === match.player1.id ? match.player1.member.name : match.player2.member.name;
                console.log(`Match ID: ${match.id} | ${match.player1.member.name} vs ${match.player2.member.name} | Winner: ${winnerName}`);
                return client.updateMatch(tournamentId, match.id, winnerId);
            })).then((matches) => {
                return matches;
            }).catch(error => {
                console.log(error.message);
            });

            // mark the league as completed
            tournamentCompleted = await client.completeLeagueTournament(tournamentId);
            console.log(`Tournament ${tournamentId} completed`);
        }

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