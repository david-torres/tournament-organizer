const { faker } = require('@faker-js/faker');

const API_BASE_URL = 'http://localhost:3000';

const memberNames = Array.from({ length: 8 }, () => faker.name.fullName());

async function createMemberIfNotExists(name) {
  const existingMemberResponse = await fetch(`${API_BASE_URL}/members/search?name=${name}`);
  const existingMember = await existingMemberResponse.json()

  if (existingMember.length > 0) {
    return existingMember[0];
  }
  return fetch(`${API_BASE_URL}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }).then((res) => res.json());
}

async function createTournament(name) {
  return fetch(`${API_BASE_URL}/tournaments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, "type": "single_elimination" }),
  }).then((res) => res.json());
}

async function addParticipant(tournamentId, memberId) {
  return fetch(`${API_BASE_URL}/tournaments/${tournamentId}/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ member_id: memberId }),
  }).then((res) => res.json());
}

async function generateMatches(tournamentId) {
  return fetch(`${API_BASE_URL}/tournaments/${tournamentId}/generate_matches`, {
    method: 'POST',
  }).then((res) => res.json());
}

async function getPendingMatches(tournamentId) {
  return fetch(`${API_BASE_URL}/tournaments/${tournamentId}/matches?status=pending`).then((res) =>
    res.json()
  );
}

async function updateMatch(tournamentId, matchId, winnerId) {
  return fetch(`${API_BASE_URL}/tournaments/${tournamentId}/matches/${matchId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ winner_id: winnerId }),
  }).then((res) => res.json());
}

async function main() {
  const members = await Promise.all(memberNames.map(createMemberIfNotExists));
  const tournament = await createTournament('Demo Tournament');
  // console.log(tournament);
  const tournamentId = tournament.id;
  await Promise.all(members.map((member) => addParticipant(tournamentId, member.id)));

  await generateMatches(tournamentId);

  let tournamentCompleted = false;

  while (!tournamentCompleted) {
    // Get the pending matches for the tournament
    const pendingMatches = await getPendingMatches(tournamentId);
    // console.log(pendingMatches);

    if (pendingMatches.length === 0) {
      // No pending matches, the tournament is complete
      tournamentCompleted = true;
      break;
    } else {
      console.log('Advance round...');
    }

    // Simulate the matches and update winners
    for (const match of pendingMatches) {
      const winnerId = Math.random() > 0.5 ? match.participant1_id : match.participant2_id;
      await updateMatch(tournamentId, match.id, winnerId);
      console.log(`Match ${match.id} completed. Winner: ${winnerId}`);
    }
  }

  console.log('Tournament completed');
}

main();

