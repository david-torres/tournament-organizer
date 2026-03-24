export {};

const test = require('node:test');
const assert = require('node:assert/strict');

const { isPowerOfTwo, updateElo, decayElo } = require('../utils');

test('isPowerOfTwo only accepts positive powers of two', () => {
  assert.equal(isPowerOfTwo(1), true);
  assert.equal(isPowerOfTwo(2), true);
  assert.equal(isPowerOfTwo(8), true);
  assert.equal(isPowerOfTwo(0), false);
  assert.equal(isPowerOfTwo(3), false);
  assert.equal(isPowerOfTwo(12), false);
});

test('updateElo rejects a winner that is not part of the match', async () => {
  const player1 = {
    id: 1,
    elo: 1200,
    async update(values) {
      Object.assign(this, values);
    },
  };
  const player2 = {
    id: 2,
    elo: 1200,
    async update(values) {
      Object.assign(this, values);
    },
  };

  await assert.rejects(() => updateElo(player1, player2, 999), /winner/i);
});

test('decayElo keeps Elo numeric and applies the inactivity threshold', () => {
  const participant = { elo: 1200 };
  const result = decayElo(participant, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-12T00:00:00Z'));

  assert.equal(result.elo, 1199);
  assert.equal(typeof result.elo, 'number');
});
