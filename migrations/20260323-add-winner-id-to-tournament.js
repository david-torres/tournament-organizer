'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // winnerId stores the winning participant id.
    await queryInterface.addColumn('Tournament', 'winnerId', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Tournament', 'winnerId');
  },
};
