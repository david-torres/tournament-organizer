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
    player1Score: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    player2Score: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    scheduledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    resultType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    forfeitByParticipantId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Participant',
        key: 'id',
      },
    },
    location: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    player1EloBefore: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    player2EloBefore: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    player1EloAfter: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    player2EloAfter: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    correctionCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    correctedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    correctionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
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
    freezeTableName: true,
    indexes: [
      {
        fields: ['tournamentId', 'player1Id', 'completedAt'],
      },
      {
        fields: ['tournamentId', 'player2Id', 'completedAt'],
      },
    ],
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
