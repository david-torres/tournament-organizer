module.exports = (sequelize, DataTypes) => {
  const Match = sequelize.define('Match', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    round: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    player1Id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Participant',
        key: 'id',
      },
    },
    player2Id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Participant',
        key: 'id',
      },
    },
    winnerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Participant',
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

  Match.associate = models => {
    Match.belongsTo(models.Tournament, {
      foreignKey: 'tournamentId',
      onDelete: 'CASCADE',
    });
  
    Match.belongsTo(models.Participant, {
      as: 'player1',
      foreignKey: 'player1Id',
      onDelete: 'CASCADE',
    });
  
    Match.belongsTo(models.Participant, {
      as: 'player2',
      foreignKey: 'player2Id',
      onDelete: 'CASCADE',
    });
  
    Match.belongsTo(models.Participant, {
      as: 'winner',
      foreignKey: 'winnerId',
      onDelete: 'SET NULL',
    });
  
    Match.belongsToMany(models.Participant, {
      as: 'players',
      through: 'match_participants',
      foreignKey: 'match_id',
    });
  
    models.Participant.belongsToMany(Match, {
      through: 'match_participants',
      foreignKey: 'participant_id',
    });
  };
  

  return Match;
};
