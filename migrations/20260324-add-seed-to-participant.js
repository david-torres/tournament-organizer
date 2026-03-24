'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Participant', 'seed', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.addIndex('Participant', ['tournamentId', 'seed'], {
      unique: true,
      name: 'participant_tournament_seed_unique',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('Participant', 'participant_tournament_seed_unique');
    await queryInterface.removeColumn('Participant', 'seed');
  },
};
