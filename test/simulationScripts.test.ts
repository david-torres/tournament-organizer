export {};

const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const packageJson = require(path.join(process.cwd(), 'package.json'));
const {
  SIMULATED_TOURNAMENT_TYPES,
  getDefaultPlayerCount,
} = require('../utils/simulationConfig');

test('simulation config covers every supported tournament type script entry', () => {
  assert.deepEqual(SIMULATED_TOURNAMENT_TYPES, [
    'single_elimination',
    'double_elimination',
    'round_robin',
    'swiss',
    'league',
    'ladder',
  ]);

  assert.equal(getDefaultPlayerCount('double_elimination'), 8);
  assert.equal(getDefaultPlayerCount('ladder'), 4);
});

test('package scripts expose simulation commands for each supported tournament type and sim-all', () => {
  assert.equal(packageJson.scripts['sim-single-elim'], 'npm run build && node dist/simulate-tournament.js single_elimination');
  assert.equal(packageJson.scripts['sim-double-elim'], 'npm run build && node dist/simulate-tournament.js double_elimination');
  assert.equal(packageJson.scripts['sim-round-robin'], 'npm run build && node dist/simulate-tournament.js round_robin');
  assert.equal(packageJson.scripts['sim-swiss'], 'npm run build && node dist/simulate-tournament.js swiss');
  assert.equal(packageJson.scripts['sim-league'], 'npm run build && node dist/simulate-league.js');
  assert.equal(packageJson.scripts['sim-ladder'], 'npm run build && node dist/simulate-tournament.js ladder');
  assert.equal(packageJson.scripts['sim-all'], 'npm run build && node dist/simulate-all.js');
});
