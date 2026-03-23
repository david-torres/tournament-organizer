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

  const startResponse = await inject(app, {
    method: 'POST',
    url: `/tournaments/${tournament.id}/start`,
  });

  assert.equal(startResponse.statusCode, 200);

  const matchesResponse = await inject(app, {
    method: 'GET',
    url: `/tournaments/${tournament.id}/matches?status=pending`,
  });
  assert.equal(matchesResponse.statusCode, 200);

  const pendingMatches = matchesResponse.json();
  assert.equal(pendingMatches.length, 1);

  const pendingMatch = pendingMatches[0];
  const winnerParticipantId = pendingMatch.player1.id;

  const updateResponse = await inject(app, {
    method: 'PATCH',
    url: `/tournaments/${tournament.id}/matches/${pendingMatch.id}`,
    payload: { winner_id: winnerParticipantId },
  });

  assert.equal(updateResponse.statusCode, 200);

  const completedMatchesResponse = await inject(app, {
    method: 'GET',
    url: `/tournaments/${tournament.id}/matches?status=completed`,
  });
  assert.equal(completedMatchesResponse.statusCode, 200);

  const completedMatches = completedMatchesResponse.json();
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

  const startResponse = await inject(app, {
    method: 'POST',
    url: `/tournaments/${tournament.id}/start`,
  });

  assert.equal(startResponse.statusCode, 200);

  const bracketResponse = await inject(app, {
    method: 'GET',
    url: `/tournaments/${tournament.id}/bracket?format=json`,
  });
  assert.equal(bracketResponse.statusCode, 200);

  const roundOneMatches = bracketResponse.json()['1'];
  assert.equal(roundOneMatches.length, 2);
  assert.equal(roundOneMatches.filter((match) => match.player2 === null).length, 1);
});
