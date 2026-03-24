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

async function addParticipant(tournamentId, memberId) {
  const response = await inject(app, {
    method: 'POST',
    url: `/tournaments/${tournamentId}/participants`,
    payload: { member_id: memberId },
  });

  assert.equal(response.statusCode, 201);
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

test.beforeEach(async () => {
  await models.sequelize.sync({ force: true });
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

test('PATCH /tournaments/:id/matches/:match_id rejects replaying a completed match', async () => {
  const tournament = await createTournament({
    name: `HTTP Match Replay ${Date.now()}`,
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

  const participantsResponse = await inject(app, {
    method: 'GET',
    url: `/tournaments/${tournament.id}/participants`,
  });
  assert.equal(participantsResponse.statusCode, 200);

  const participants = participantsResponse.json();
  const createMatchResponse = await inject(app, {
    method: 'POST',
    url: `/tournaments/${tournament.id}/matches`,
    payload: {
      participant1: participants[0].id,
      participant2: participants[1].id,
    },
  });
  assert.equal(createMatchResponse.statusCode, 201);

  const match = createMatchResponse.json();
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
