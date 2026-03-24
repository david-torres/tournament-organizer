const test = require('node:test');
const assert = require('node:assert/strict');

const {
  generateLeagueMatches,
  generateRoundRobinMatches,
  generateSwissMatches,
} = require('../services/matchGenerators');

function makeParticipants(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    elo: 1200 + index * 25,
  }));
}

function normalizePair(match) {
  return [match.player1Id, match.player2Id].sort((a, b) => a - b).join('-');
}

test('generateRoundRobinMatches produces every unique pairing exactly once', () => {
  const participants = makeParticipants(4);
  const matches = generateRoundRobinMatches(participants);

  assert.equal(matches.length, 6);

  const pairKeys = matches.map(normalizePair);
  assert.equal(new Set(pairKeys).size, 6);
});

test('generateLeagueMatches produces the same scheduled season as round robin pairings', () => {
  const participants = makeParticipants(4);
  const leagueMatches = generateLeagueMatches(participants);

  assert.equal(leagueMatches.length, 6);
  assert.equal(new Set(leagueMatches.map(normalizePair)).size, 6);
});

test('generateSwissMatches assigns one bye and avoids rematches in later rounds', () => {
  const participants = makeParticipants(5);
  const roundOne = generateSwissMatches(participants);

  const byes = roundOne.filter((match) => match.player2Id === null);
  assert.equal(byes.length, 1);
  assert.equal(byes[0].player1Id, 1);

  const roundTwo = generateSwissMatches(participants, [
    { round: 1, winnerId: 1 },
    { round: 1, winnerId: 2 },
  ]);

  const roundOnePairs = new Set(roundOne.filter((match) => match.player2Id !== null).map(normalizePair));
  const roundTwoPairs = roundTwo.filter((match) => match.player2Id !== null).map(normalizePair);

  for (const pair of roundTwoPairs) {
    assert.ok(!roundOnePairs.has(pair), `unexpected rematch: ${pair}`);
  }
});

test('generateSwissMatches reads ids and elo from Sequelize-style model instances', () => {
  const participants = [
    {
      get() {
        return { id: 1, elo: 1500 };
      },
    },
    {
      get() {
        return { id: 2, elo: 1400 };
      },
    },
    {
      get() {
        return { id: 3, elo: 1300 };
      },
    },
  ];

  const matches = generateSwissMatches(participants);

  assert.equal(matches.length, 2);
  assert.equal(matches.filter((match) => match.player2Id === null).length, 1);

  for (const match of matches) {
    assert.notEqual(match.player1Id, undefined);
  }
});
