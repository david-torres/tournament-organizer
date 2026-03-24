'use strict';

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.addIndex('Match', ['tournamentId', 'player1Id', 'completedAt'], {
      name: 'match_tournament_player1_completed_at_idx',
    });
    await queryInterface.addIndex('Match', ['tournamentId', 'player2Id', 'completedAt'], {
      name: 'match_tournament_player2_completed_at_idx',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('Match', 'match_tournament_player2_completed_at_idx');
    await queryInterface.removeIndex('Match', 'match_tournament_player1_completed_at_idx');
  },
};
