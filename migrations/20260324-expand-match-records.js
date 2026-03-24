'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Match', 'player1Score', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('Match', 'player2Score', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('Match', 'scheduledAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('Match', 'completedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('Match', 'resultType', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Match', 'forfeitByParticipantId', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('Match', 'location', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Match', 'notes', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('Match', 'player1EloBefore', {
      type: Sequelize.FLOAT,
      allowNull: true,
    });
    await queryInterface.addColumn('Match', 'player2EloBefore', {
      type: Sequelize.FLOAT,
      allowNull: true,
    });
    await queryInterface.addColumn('Match', 'player1EloAfter', {
      type: Sequelize.FLOAT,
      allowNull: true,
    });
    await queryInterface.addColumn('Match', 'player2EloAfter', {
      type: Sequelize.FLOAT,
      allowNull: true,
    });
    await queryInterface.addColumn('Match', 'correctionCount', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('Match', 'correctedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('Match', 'correctionReason', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Match', 'correctionReason');
    await queryInterface.removeColumn('Match', 'correctedAt');
    await queryInterface.removeColumn('Match', 'correctionCount');
    await queryInterface.removeColumn('Match', 'player2EloAfter');
    await queryInterface.removeColumn('Match', 'player1EloAfter');
    await queryInterface.removeColumn('Match', 'player2EloBefore');
    await queryInterface.removeColumn('Match', 'player1EloBefore');
    await queryInterface.removeColumn('Match', 'notes');
    await queryInterface.removeColumn('Match', 'location');
    await queryInterface.removeColumn('Match', 'forfeitByParticipantId');
    await queryInterface.removeColumn('Match', 'resultType');
    await queryInterface.removeColumn('Match', 'completedAt');
    await queryInterface.removeColumn('Match', 'scheduledAt');
    await queryInterface.removeColumn('Match', 'player2Score');
    await queryInterface.removeColumn('Match', 'player1Score');
  },
};
