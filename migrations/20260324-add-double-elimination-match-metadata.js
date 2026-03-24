'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Match', 'bracket', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('Match', 'position', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.addIndex('Match', ['tournamentId', 'bracket', 'round', 'position'], {
      name: 'match_tournament_bracket_round_position_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('Match', 'match_tournament_bracket_round_position_idx');
    await queryInterface.removeColumn('Match', 'position');
    await queryInterface.removeColumn('Match', 'bracket');
  },
};
