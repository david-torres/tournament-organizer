module.exports = (sequelize, DataTypes) => {
  const Tournament = sequelize.define('Tournament', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'single_elimination',
    },
    size: {
      type: DataTypes.INTEGER,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'pending',
    },
  }, {
    freezeTableName: true,
    indexes: [
      {
        unique: true,
        fields: ['name']
      }
    ]
  });

  Tournament.associate = models => {
    Tournament.hasMany(models.Participant, {
      foreignKey: 'tournamentId',
      as: 'participants'
    });

    Tournament.hasMany(models.Match, {
      foreignKey: 'tournamentId',
      as: 'matches'
    });
  };

  return Tournament;
};
