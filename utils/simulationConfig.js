const SIMULATED_TOURNAMENT_TYPES = Object.freeze([
  'single_elimination',
  'double_elimination',
  'round_robin',
  'swiss',
  'league',
  'ladder',
]);

const DEFAULT_PLAYER_COUNT_BY_TYPE = Object.freeze({
  single_elimination: 8,
  double_elimination: 8,
  round_robin: 8,
  swiss: 8,
  league: 8,
  ladder: 4,
});

const DEFAULT_LADDER_MATCH_COUNT = 6;

function getDefaultPlayerCount(type) {
  return DEFAULT_PLAYER_COUNT_BY_TYPE[type] || 8;
}

module.exports = {
  DEFAULT_LADDER_MATCH_COUNT,
  DEFAULT_PLAYER_COUNT_BY_TYPE,
  SIMULATED_TOURNAMENT_TYPES,
  getDefaultPlayerCount,
};
