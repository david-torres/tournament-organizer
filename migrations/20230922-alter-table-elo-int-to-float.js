'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('Member', 'elo', {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 1200,
    });
    await queryInterface.changeColumn('Participant', 'elo', {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 1200,
      });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('Member', 'elo', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1200,
    });
    await queryInterface.changeColumn('Participant', 'elo', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1200,
      });
  }
};