export {};

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assignEffectiveSeeds,
  buildDoubleEliminationPlan,
  generateDoubleEliminationMatches,
  generateLeagueMatches,
  generateRoundRobinMatches,
  generateSwissMatches,
  generateSingleEliminationMatches,
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

test('generateSingleEliminationMatches honors manual seeds with standard bracket placement', () => {
  const matches = generateSingleEliminationMatches([
    { id: 101, seed: 4 },
    { id: 102, seed: 1 },
    { id: 103, seed: 3 },
    { id: 104, seed: 2 },
  ]);

  assert.deepStrictEqual(matches, [
    { round: 1, player1Id: 102, player2Id: 101 },
    { round: 1, player1Id: 104, player2Id: 103 },
  ]);
});

test('generateDoubleEliminationMatches seeds the winners bracket opening round', () => {
  const matches = generateDoubleEliminationMatches([
    { id: 101, seed: 4 },
    { id: 102, seed: 1 },
    { id: 103, seed: 3 },
    { id: 104, seed: 2 },
  ]);

  assert.deepStrictEqual(matches, [
    { bracket: 'winners', round: 1, position: 1, player1Id: 102, player2Id: 101 },
    { bracket: 'winners', round: 1, position: 2, player1Id: 104, player2Id: 103 },
  ]);
});

test('buildDoubleEliminationPlan includes winners, losers, and finals nodes for four players', () => {
  const plan = buildDoubleEliminationPlan(4);

  assert.ok(plan.some((match) => match.id === 'W:1:1'));
  assert.ok(plan.some((match) => match.id === 'W:2:1'));
  assert.ok(plan.some((match) => match.id === 'L:1:1'));
  assert.ok(plan.some((match) => match.id === 'L:2:1'));
  assert.ok(plan.some((match) => match.id === 'F:1:1'));
  assert.ok(plan.some((match) => match.id === 'F:2:1'));
});

test('assignEffectiveSeeds fills unseeded participants after explicit seeds', () => {
  const seededParticipants = assignEffectiveSeeds([
    { id: 1, seed: 3 },
    { id: 2, seed: null },
    { id: 3, seed: 1 },
    { id: 4, seed: null },
  ]);

  assert.deepStrictEqual(
    seededParticipants.map((participant) => ({ id: participant.id, effectiveSeed: participant.effectiveSeed })),
    [
      { id: 3, effectiveSeed: 1 },
      { id: 1, effectiveSeed: 3 },
      { id: 2, effectiveSeed: 2 },
      { id: 4, effectiveSeed: 4 },
    ],
  );
});

test('generateSwissMatches assigns one bye and avoids rematches in later rounds', () => {
  const participants = makeParticipants(5);
  const roundOne = generateSwissMatches(participants);
  const roundOneCompletedMatches = roundOne.map((match) => ({
    ...match,
    winnerId: match.player1Id,
  }));

  const byes = roundOne.filter((match) => match.player2Id === null);
  assert.equal(byes.length, 1);
  assert.equal(byes[0].player1Id, 1);

  const roundTwo = generateSwissMatches(participants, roundOneCompletedMatches);

  const roundOnePairs = new Set(roundOne.filter((match) => match.player2Id !== null).map(normalizePair));
  const roundTwoPairs = roundTwo.filter((match) => match.player2Id !== null).map(normalizePair);

  for (const pair of roundTwoPairs) {
    assert.ok(!roundOnePairs.has(pair), `unexpected rematch: ${pair}`);
  }
});

test('generateSwissMatches uses actual historical pairings across multiple completed rounds', () => {
  const participants = makeParticipants(8);
  const historicalMatches = [
    { round: 1, player1Id: 8, player2Id: 7, winnerId: 8 },
    { round: 1, player1Id: 6, player2Id: 5, winnerId: 6 },
    { round: 1, player1Id: 4, player2Id: 3, winnerId: 4 },
    { round: 1, player1Id: 2, player2Id: 1, winnerId: 2 },
    { round: 2, player1Id: 8, player2Id: 6, winnerId: 8 },
    { round: 2, player1Id: 4, player2Id: 2, winnerId: 4 },
    { round: 2, player1Id: 7, player2Id: 5, winnerId: 7 },
    { round: 2, player1Id: 3, player2Id: 1, winnerId: 3 },
  ];

  const roundThree = generateSwissMatches(participants, historicalMatches);

  assert.equal(roundThree.length, 4);
  assert.ok(roundThree.every((match) => match.round === 3));

  const historicalPairs = new Set(historicalMatches.map(normalizePair));
  for (const match of roundThree) {
    assert.ok(!historicalPairs.has(normalizePair(match)), `unexpected rematch: ${normalizePair(match)}`);
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
