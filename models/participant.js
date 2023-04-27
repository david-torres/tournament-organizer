module.exports = (sequelize, DataTypes) => {
  const Participant = sequelize.define('Participant', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    memberId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Member',
        key: 'id',
      },
    },
    tournamentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Tournament',
        key: 'id',
      },
    },
  }, {
    freezeTableName: true
  });

  Participant.associate = models => {
    Participant.belongsTo(models.Member, {
      foreignKey: 'memberId',
    });

    Participant.belongsTo(models.Tournament, {
      foreignKey: 'tournamentId',
    });

    Participant.hasMany(models.Match, {
      as: 'player1Matches',
      foreignKey: 'player1Id',
    });

    Participant.hasMany(models.Match, {
      as: 'player2Matches',
      foreignKey: 'player2Id',
    });
  };

  return Participant;
};
