export {};

const COMPLETED_RESULT_TYPES = new Set(['win', 'draw', 'forfeit', 'bye']);

function isMatchCompleted(match) {
  return Boolean(
    match?.completedAt
    || match?.winnerId != null
    || COMPLETED_RESULT_TYPES.has(match?.resultType),
  );
}

function isMatchDraw(match) {
  return match?.resultType === 'draw';
}

module.exports = {
  COMPLETED_RESULT_TYPES,
  isMatchCompleted,
  isMatchDraw,
};
