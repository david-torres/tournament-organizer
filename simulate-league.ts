export {};

const { simulateTournament } = require('./simulate-tournament');

simulateTournament('league').catch(() => {
  process.exitCode = 1;
});
