const test = require('node:test');
const assert = require('node:assert/strict');
const inject = require('light-my-request');

const { createApp } = require('../app');
const models = require('../models');

const app = createApp();

async function createMember(name) {
  const response = await inject(app, {
    method: 'POST',
    url: '/members',
    payload: { name },
  });

  assert.equal(response.statusCode, 200);
  return response.json();
}

async function createTournament(payload) {
  const response = await inject(app, {
    method: 'POST',
    url: '/tournaments',
    payload,
  });

  assert.equal(response.statusCode, 201);
  return response.json();
}

async function addParticipant(tournamentId, memberId, options = {}) {
  const response = await inject(app, {
    method: 'POST',
    url: `/tournaments/${tournamentId}/participants`,
    payload: { member_id: memberId, ...options },
  });

  assert.equal(response.statusCode, 201);
}

async function updateParticipant(tournamentId, participantId, payload) {
  const response = await inject(app, {
    method: 'PATCH',
    url: `/tournaments/${tournamentId}/participants/${participantId}`,
    payload,
  });

  assert.equal(response.statusCode, 200);
  return response.json();
}

async function startTournament(tournamentId) {
  const response = await inject(app, {
    method: 'POST',
    url: `/tournaments/${tournamentId}/start`,
  });

  assert.equal(response.statusCode, 200);
}

async function getMatches(tournamentId, params = {}) {
  const searchParams = new URLSearchParams(params).toString();
  const suffix = searchParams ? `?${searchParams}` : '';

  const response = await inject(app, {
    method: 'GET',
    url: `/tournaments/${tournamentId}/matches${suffix}`,
  });

  assert.equal(response.statusCode, 200);
  return response.json();
}

async function getTournament(tournamentId) {
  const response = await inject(app, {
    method: 'GET',
    url: `/tournaments/${tournamentId}`,
  });

  assert.equal(response.statusCode, 200);
  return response.json();
}

async function getStandings(tournamentId) {
  const response = await inject(app, {
    method: 'GET',
    url: `/tournaments/${tournamentId}/standings`,
  });

  assert.equal(response.statusCode, 200);
  return response.json();
}

async function listTournaments(params = {}) {
  const searchParams = new URLSearchParams(params).toString();
  const suffix = searchParams ? `?${searchParams}` : '';

  const response = await inject(app, {
    method: 'GET',
    url: `/tournaments${suffix}`,
  });

  assert.equal(response.statusCode, 200);
  return response.json();
}

test.beforeEach(async () => {
  await models.sequelize.sync({ force: true });
});

test('GET /tournaments lists tournaments and GET /tournaments/:id returns a single tournament', async () => {
  const firstTournament = await createTournament({
    name: `HTTP List One ${Date.now()}`,
    type: 'league',
  });
  const secondTournament = await createTournament({
    name: `HTTP List Two ${Date.now()}`,
    type: 'swiss',
    size: 8,
  });

  const tournaments = await listTournaments();
  assert.equal(tournaments.length, 2);
  assert.equal(tournaments[0].id, secondTournament.id);
  assert.equal(tournaments[1].id, firstTournament.id);

  const detail = await getTournament(firstTournament.id);
  assert.equal(detail.id, firstTournament.id);
  assert.equal(detail.name, firstTournament.name);
  assert.equal(detail.status, 'pending');
});

test('GET /members paginates large member lists and exposes pagination headers', async () => {
  await Promise.all(
    Array.from({ length: 55 }, (_, index) => createMember(`Paged Member ${Date.now()}-${index}`)),
  );

  const firstPageResponse = await inject(app, {
    method: 'GET',
    url: '/members',
  });

  assert.equal(firstPageResponse.statusCode, 200);
  assert.equal(firstPageResponse.json().length, 50);
  assert.equal(firstPageResponse.headers['x-page'], '1');
  assert.equal(firstPageResponse.headers['x-limit'], '50');
  assert.equal(firstPageResponse.headers['x-total-count'], '55');
  assert.equal(firstPageResponse.headers['x-total-pages'], '2');

  const secondPageResponse = await inject(app, {
    method: 'GET',
    url: '/members?page=2&limit=10',
  });

  assert.equal(secondPageResponse.statusCode, 200);
  assert.equal(secondPageResponse.json().length, 10);
  assert.equal(secondPageResponse.headers['x-page'], '2');
  assert.equal(secondPageResponse.headers['x-limit'], '10');
  assert.equal(secondPageResponse.headers['x-total-count'], '55');
  assert.equal(secondPageResponse.headers['x-total-pages'], '6');
});

test('GET /tournaments/:id/standings exposes standings metadata for every tournament type', async () => {
  const tournamentFixtures = [
    { type: 'single_elimination', size: 2 },
    { type: 'round_robin', size: 2 },
    { type: 'swiss', size: 2 },
    { type: 'league' },
  ];

  for (const fixture of tournamentFixtures) {
    const tournament = await createTournament({
      name: `HTTP Standings ${fixture.type} ${Date.now()}`,
      ...fixture,
    });
    const memberOne = await createMember(`Standings ${fixture.type} One ${Date.now()}`);
    const memberTwo = await createMember(`Standings ${fixture.type} Two ${Date.now()}`);

    await addParticipant(tournament.id, memberOne.id);
    await addParticipant(tournament.id, memberTwo.id);

    const standings = await getStandings(tournament.id);

    assert.equal(standings.tournamentId, tournament.id);
    assert.equal(standings.type, fixture.type);
    assert.equal(standings.status, 'pending');
    assert.equal(standings.standings.length, 2);
    assert.ok(Array.isArray(standings.tieBreakOrder));
    assert.equal(standings.standings[0].rank, 1);
    assert.equal(standings.standings[1].rank, 2);
  }
});

test('list endpoints reject invalid pagination parameters with 400', async () => {
  const memberResponse = await inject(app, {
    method: 'GET',
    url: '/members?page=0',
  });
  assert.equal(memberResponse.statusCode, 400);

  const tournamentsResponse = await inject(app, {
    method: 'GET',
    url: '/tournaments?limit=abc',
  });
  assert.equal(tournamentsResponse.statusCode, 400);
});

test('PATCH /tournaments/:id updates pending tournament metadata', async () => {
  const tournament = await createTournament({
    name: `HTTP Patch Tournament ${Date.now()}`,
    type: 'single_elimination',
    size: 4,
  });

  const response = await inject(app, {
    method: 'PATCH',
    url: `/tournaments/${tournament.id}`,
    payload: {
      name: `${tournament.name} Updated`,
      size: 8,
    },
  });

  assert.equal(response.statusCode, 200);

  const updatedTournament = response.json();
  assert.equal(updatedTournament.name, `${tournament.name} Updated`);
  assert.equal(updatedTournament.size, 8);

  const detail = await getTournament(tournament.id);
  assert.equal(detail.name, `${tournament.name} Updated`);
  assert.equal(detail.size, 8);
});

test('pending tournament participants can be manually seeded before start', async () => {
  const tournament = await createTournament({
    name: `HTTP Participant Seeding ${Date.now()}`,
    type: 'single_elimination',
    size: 4,
  });

  const members = await Promise.all([
    createMember(`Seed One ${Date.now()}`),
    createMember(`Seed Two ${Date.now()}`),
    createMember(`Seed Three ${Date.now()}`),
    createMember(`Seed Four ${Date.now()}`),
  ]);

  await addParticipant(tournament.id, members[0].id, { seed: 4 });
  await addParticipant(tournament.id, members[1].id, { seed: 1 });
  await addParticipant(tournament.id, members[2].id);
  await addParticipant(tournament.id, members[3].id);

  const participantsBeforeUpdate = await inject(app, {
    method: 'GET',
    url: `/tournaments/${tournament.id}/participants`,
  });
  assert.equal(participantsBeforeUpdate.statusCode, 200);

  const unseededParticipant = participantsBeforeUpdate.json().find((participant) => participant.seed == null);
  const updatedParticipant = await updateParticipant(tournament.id, unseededParticipant.id, { seed: 2 });
  assert.equal(updatedParticipant.seed, 2);

  const participantsResponse = await inject(app, {
    method: 'GET',
    url: `/tournaments/${tournament.id}/participants`,
  });
  assert.equal(participantsResponse.statusCode, 200);

  const participants = participantsResponse.json();
  assert.deepStrictEqual(
    participants.map((participant) => participant.seed),
    [1, 2, 4, null],
  );
});

test('participant seeding rejects duplicate seeds within the same tournament', async () => {
  const tournament = await createTournament({
    name: `HTTP Duplicate Seed ${Date.now()}`,
    type: 'single_elimination',
    size: 4,
  });

  const members = await Promise.all([
    createMember(`Dup Seed One ${Date.now()}`),
    createMember(`Dup Seed Two ${Date.now()}`),
  ]);

  await addParticipant(tournament.id, members[0].id, { seed: 1 });
  await addParticipant(tournament.id, members[1].id);

  const participantsResponse = await inject(app, {
    method: 'GET',
    url: `/tournaments/${tournament.id}/participants`,
  });
  assert.equal(participantsResponse.statusCode, 200);

  const secondParticipant = participantsResponse.json().find((participant) => participant.seed == null);
  const updateResponse = await inject(app, {
    method: 'PATCH',
    url: `/tournaments/${tournament.id}/participants/${secondParticipant.id}`,
    payload: { seed: 1 },
  });

  assert.equal(updateResponse.statusCode, 409);
  assert.match(updateResponse.json().error, /seed/i);
});

test('participants and matches endpoints paginate tournament-scoped lists', async () => {
  const tournament = await createTournament({
    name: `HTTP Pagination Tournament ${Date.now()}`,
    type: 'league',
  });

  const members = await Promise.all(
    Array.from({ length: 12 }, (_, index) => createMember(`Paged Participant ${Date.now()}-${index}`)),
  );

  for (const member of members) {
    await addParticipant(tournament.id, member.id);
  }

  await startTournament(tournament.id);

  const participantsResponse = await inject(app, {
    method: 'GET',
    url: `/tournaments/${tournament.id}/participants?page=2&limit=5`,
  });

  assert.equal(participantsResponse.statusCode, 200);
  assert.equal(participantsResponse.json().length, 5);
  assert.equal(participantsResponse.headers['x-page'], '2');
  assert.equal(participantsResponse.headers['x-limit'], '5');
  assert.equal(participantsResponse.headers['x-total-count'], '12');
  assert.equal(participantsResponse.headers['x-total-pages'], '3');

  const matchesResponse = await inject(app, {
    method: 'GET',
    url: `/tournaments/${tournament.id}/matches?page=2&limit=10`,
  });

  assert.equal(matchesResponse.statusCode, 200);
  assert.equal(matchesResponse.json().length, 10);
  assert.equal(matchesResponse.headers['x-page'], '2');
  assert.equal(matchesResponse.headers['x-limit'], '10');
  assert.equal(matchesResponse.headers['x-total-count'], '66');
  assert.equal(matchesResponse.headers['x-total-pages'], '7');
});

test('PATCH /tournaments/:id archives tournaments, latest ignores archived tournaments, and archived tournaments reject new participants', async () => {
  const activeTournament = await createTournament({
    name: `HTTP Active Tournament ${Date.now()}`,
    type: 'league',
  });
  const archivedTournament = await createTournament({
    name: `HTTP Archived Tournament ${Date.now()}`,
    type: 'league',
  });

  const archiveResponse = await inject(app, {
    method: 'PATCH',
    url: `/tournaments/${archivedTournament.id}`,
    payload: { status: 'archived' },
  });

  assert.equal(archiveResponse.statusCode, 200);
  assert.equal(archiveResponse.json().status, 'archived');

  const latestResponse = await inject(app, {
    method: 'GET',
    url: '/tournaments/latest',
  });

  assert.equal(latestResponse.statusCode, 200);
  assert.equal(latestResponse.json().id, activeTournament.id);

  const member = await createMember(`Archived Member ${Date.now()}`);
  const addParticipantResponse = await inject(app, {
    method: 'POST',
    url: `/tournaments/${archivedTournament.id}/participants`,
    payload: { member_id: member.id },
  });

  assert.equal(addParticipantResponse.statusCode, 409);
  assert.match(addParticipantResponse.json().error, /pending/i);
});

test('PATCH /tournaments/:id/matches/:match_id accepts participant ids and completes a single-elimination tournament', async () => {
  await Promise.all(
    Array.from({ length: 10 }, (_, index) => createMember(`Unused ${Date.now()}-${index}`)),
  );
  const winnerMember = await createMember(`Winner ${Date.now()}`);
  const loserMember = await createMember(`Loser ${Date.now()}`);

  const tournament = await createTournament({
    name: `HTTP Single Elim ${Date.now()}`,
    type: 'single_elimination',
    size: 2,
  });

  await addParticipant(tournament.id, winnerMember.id);
  await addParticipant(tournament.id, loserMember.id);

  await startTournament(tournament.id);

  const pendingMatches = await getMatches(tournament.id, { status: 'pending' });
  assert.equal(pendingMatches.length, 1);

  const pendingMatch = pendingMatches[0];
  const winnerParticipantId = pendingMatch.player1.id;

  const updateResponse = await inject(app, {
    method: 'PATCH',
    url: `/tournaments/${tournament.id}/matches/${pendingMatch.id}`,
    payload: { winner_id: winnerParticipantId },
  });

  assert.equal(updateResponse.statusCode, 200);

  const completedMatches = await getMatches(tournament.id, { status: 'completed' });
  assert.equal(completedMatches.length, 1);
  assert.equal(completedMatches[0].winner.id, winnerParticipantId);

  const refreshedTournament = await models.Tournament.findByPk(tournament.id);
  assert.equal(refreshedTournament.status, 'completed');
  assert.equal(refreshedTournament.winnerId, winnerParticipantId);
});

test('single-elimination start uses manual seed placement instead of randomized setup', async () => {
  const tournament = await createTournament({
    name: `HTTP Manual Seeding ${Date.now()}`,
    type: 'single_elimination',
    size: 4,
  });

  const members = await Promise.all([
    createMember(`Bracket Seed 4 ${Date.now()}`),
    createMember(`Bracket Seed 1 ${Date.now()}`),
    createMember(`Bracket Seed 3 ${Date.now()}`),
    createMember(`Bracket Seed 2 ${Date.now()}`),
  ]);

  await addParticipant(tournament.id, members[0].id, { seed: 4 });
  await addParticipant(tournament.id, members[1].id, { seed: 1 });
  await addParticipant(tournament.id, members[2].id, { seed: 3 });
  await addParticipant(tournament.id, members[3].id, { seed: 2 });

  await startTournament(tournament.id);

  const matches = await getMatches(tournament.id, { status: 'pending' });
  assert.equal(matches.length, 2);
  assert.deepStrictEqual(
    matches.map((match) => [match.player1.member.name, match.player2.member.name]),
    [
      [members[1].name, members[0].name],
      [members[3].name, members[2].name],
    ],
  );
});

test('POST /tournaments/:id/reset clears completed tournament matches and winner state', async () => {
  const winnerMember = await createMember(`Reset Winner ${Date.now()}`);
  const loserMember = await createMember(`Reset Loser ${Date.now()}`);

  const tournament = await createTournament({
    name: `HTTP Reset ${Date.now()}`,
    type: 'single_elimination',
    size: 2,
  });

  await addParticipant(tournament.id, winnerMember.id);
  await addParticipant(tournament.id, loserMember.id);
  await startTournament(tournament.id);

  const pendingMatches = await getMatches(tournament.id, { status: 'pending' });
  const updateResponse = await inject(app, {
    method: 'PATCH',
    url: `/tournaments/${tournament.id}/matches/${pendingMatches[0].id}`,
    payload: { winner_id: pendingMatches[0].player1.id },
  });
  assert.equal(updateResponse.statusCode, 200);

  const resetResponse = await inject(app, {
    method: 'POST',
    url: `/tournaments/${tournament.id}/reset`,
  });
  assert.equal(resetResponse.statusCode, 200);
  assert.match(resetResponse.json().message, /reset/i);

  const refreshedTournament = await models.Tournament.findByPk(tournament.id);
  assert.equal(refreshedTournament.status, 'pending');
  assert.equal(refreshedTournament.winnerId, null);

  const remainingMatches = await models.Match.count({
    where: { tournamentId: tournament.id },
  });
  assert.equal(remainingMatches, 0);
});

test('DELETE /tournaments/:id deletes pending tournaments and rejects in-progress tournaments', async () => {
  const pendingTournament = await createTournament({
    name: `HTTP Delete Pending ${Date.now()}`,
    type: 'league',
  });

  const deletePendingResponse = await inject(app, {
    method: 'DELETE',
    url: `/tournaments/${pendingTournament.id}`,
  });
  assert.equal(deletePendingResponse.statusCode, 200);
  assert.match(deletePendingResponse.json().message, /deleted/i);
  assert.equal(await models.Tournament.findByPk(pendingTournament.id), null);

  const activeTournament = await createTournament({
    name: `HTTP Delete Active ${Date.now()}`,
    type: 'league',
  });

  const startResponse = await inject(app, {
    method: 'POST',
    url: `/tournaments/${activeTournament.id}/start`,
  });
  assert.equal(startResponse.statusCode, 200);

  const deleteActiveResponse = await inject(app, {
    method: 'DELETE',
    url: `/tournaments/${activeTournament.id}`,
  });
  assert.equal(deleteActiveResponse.statusCode, 409);
  assert.match(deleteActiveResponse.json().error, /in-progress/i);
});

test('league start generates a scheduled season and league completion is automatic after the final fixture', async () => {
  const tournament = await createTournament({
    name: `HTTP League Schedule ${Date.now()}`,
    type: 'league',
  });

  const members = await Promise.all([
    createMember(`League One ${Date.now()}`),
    createMember(`League Two ${Date.now()}`),
    createMember(`League Three ${Date.now()}`),
  ]);

  for (const member of members) {
    await addParticipant(tournament.id, member.id);
  }

  await startTournament(tournament.id);

  const scheduledMatches = await getMatches(tournament.id, { status: 'pending' });
  assert.equal(scheduledMatches.length, 3);

  for (const match of scheduledMatches) {
    const response = await inject(app, {
      method: 'PATCH',
      url: `/tournaments/${tournament.id}/matches/${match.id}`,
      payload: { winner_id: match.player1.id },
    });

    assert.equal(response.statusCode, 200);
  }

  const refreshedTournament = await models.Tournament.findByPk(tournament.id);
  assert.equal(refreshedTournament.status, 'completed');
  assert.notEqual(refreshedTournament.winnerId, null);

  const standings = await getStandings(tournament.id);
  assert.equal(standings.status, 'completed');
  assert.equal(standings.tieBreakOrder[0], 'wins');
  assert.equal(standings.standings[0].participantId, refreshedTournament.winnerId);
  assert.equal(standings.standings[0].isWinner, true);
});

test('GET /tournaments/:id/bracket?format=json returns bye matches for swiss tournaments', async () => {
  const tournament = await createTournament({
    name: `HTTP Swiss ${Date.now()}`,
    type: 'swiss',
    size: 3,
  });

  const members = await Promise.all([
    createMember(`Swiss One ${Date.now()}`),
    createMember(`Swiss Two ${Date.now()}`),
    createMember(`Swiss Three ${Date.now()}`),
  ]);

  for (const member of members) {
    await addParticipant(tournament.id, member.id);
  }

  await startTournament(tournament.id);

  const bracketResponse = await inject(app, {
    method: 'GET',
    url: `/tournaments/${tournament.id}/bracket?format=json`,
  });
  assert.equal(bracketResponse.statusCode, 200);

  const roundOneMatches = bracketResponse.json()['1'];
  assert.equal(roundOneMatches.length, 2);
  assert.equal(roundOneMatches.filter((match) => match.player2 === null).length, 1);
});

test('Swiss tournaments auto-complete bye matches and still advance after the played match is updated', async () => {
  const tournament = await createTournament({
    name: `HTTP Swiss Bye ${Date.now()}`,
    type: 'swiss',
    size: 3,
  });

  const members = await Promise.all([
    createMember(`Bye One ${Date.now()}`),
    createMember(`Bye Two ${Date.now()}`),
    createMember(`Bye Three ${Date.now()}`),
  ]);

  for (const member of members) {
    await addParticipant(tournament.id, member.id);
  }

  await startTournament(tournament.id);

  const completedRoundOneMatches = await getMatches(tournament.id, { status: 'completed' });
  const byeMatch = completedRoundOneMatches.find((match) => match.player2 === null);
  assert.ok(byeMatch, 'expected the swiss bye match to be auto-completed');
  assert.equal(byeMatch.winner.id, byeMatch.player1.id);

  const roundOneMatches = await getMatches(tournament.id, { status: 'pending' });
  const playedMatch = roundOneMatches.find((match) => match.player2 !== null);

  const playedUpdateResponse = await inject(app, {
    method: 'PATCH',
    url: `/tournaments/${tournament.id}/matches/${playedMatch.id}`,
    payload: { winner_id: playedMatch.player1.id },
  });

  assert.equal(playedUpdateResponse.statusCode, 200);

  const roundTwoMatches = await getMatches(tournament.id, { status: 'pending' });
  assert.equal(roundTwoMatches.length, 1);
  assert.equal(roundTwoMatches[0].round, 2);
  assert.notEqual(roundTwoMatches[0].player2, null);
});

test('GET /tournaments/:id/bracket?format=html renders swiss bye matches as HTML', async () => {
  const tournament = await createTournament({
    name: `HTTP Swiss Html ${Date.now()}`,
    type: 'swiss',
    size: 3,
  });

  const members = await Promise.all([
    createMember(`Html One ${Date.now()}`),
    createMember(`Html Two ${Date.now()}`),
    createMember(`Html Three ${Date.now()}`),
  ]);

  for (const member of members) {
    await addParticipant(tournament.id, member.id);
  }

  await startTournament(tournament.id);

  const bracketResponse = await inject(app, {
    method: 'GET',
    url: `/tournaments/${tournament.id}/bracket?format=html`,
  });

  assert.equal(bracketResponse.statusCode, 200);
  assert.match(bracketResponse.headers['content-type'], /html/);
  assert.match(bracketResponse.body, /BYE/);
  assert.match(bracketResponse.body, /Html One|Html Two|Html Three/);
});

test('POST /tournaments/:id/matches rejects manual league match creation once scheduled fixtures exist', async () => {
  const tournament = await createTournament({
    name: `HTTP Manual League Match ${Date.now()}`,
    type: 'league',
  });

  const members = await Promise.all([
    createMember(`Replay Winner ${Date.now()}`),
    createMember(`Replay Loser ${Date.now()}`),
  ]);

  for (const member of members) {
    await addParticipant(tournament.id, member.id);
  }

  await startTournament(tournament.id);

  const createMatchResponse = await inject(app, {
    method: 'POST',
    url: `/tournaments/${tournament.id}/matches`,
    payload: {
      participant1: 1,
      participant2: 2,
    },
  });

  assert.equal(createMatchResponse.statusCode, 409);
  assert.match(createMatchResponse.json().error, /generated automatically/i);
});

test('PATCH /tournaments/:id/matches/:match_id rejects replaying a completed match', async () => {
  const tournament = await createTournament({
    name: `HTTP Match Replay ${Date.now()}`,
    type: 'league',
  });

  const members = await Promise.all([
    createMember(`Replay Winner ${Date.now()}`),
    createMember(`Replay Loser ${Date.now()}`),
    createMember(`Replay Third ${Date.now()}`),
  ]);

  for (const member of members) {
    await addParticipant(tournament.id, member.id);
  }

  await startTournament(tournament.id);

  const scheduledMatches = await getMatches(tournament.id, { status: 'pending' });
  assert.equal(scheduledMatches.length, 3);

  const match = scheduledMatches[0];
  const firstResponse = await inject(app, {
    method: 'PATCH',
    url: `/tournaments/${tournament.id}/matches/${match.id}`,
    payload: { winner_id: match.player1.id },
  });
  assert.equal(firstResponse.statusCode, 200);

  const secondResponse = await inject(app, {
    method: 'PATCH',
    url: `/tournaments/${tournament.id}/matches/${match.id}`,
    payload: { winner_id: match.player1.id },
  });
  assert.equal(secondResponse.statusCode, 409);
});
