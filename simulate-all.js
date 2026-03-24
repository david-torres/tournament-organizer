const { spawnSync } = require('node:child_process');
const { SIMULATED_TOURNAMENT_TYPES } = require('./utils/simulationConfig');

function runSimulation(type) {
  console.log(`\n=== Simulating ${type} ===`);

  const result = spawnSync(process.execPath, ['simulate-tournament.js', type], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`Simulation failed for ${type}`);
  }
}

function main() {
  SIMULATED_TOURNAMENT_TYPES.forEach(runSimulation);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
