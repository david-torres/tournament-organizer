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
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'pending',
    },
  }, {
    freezeTableName: true
  });

  Tournament.associate = models => {
    Tournament.hasMany(models.Participant, {
      foreignKey: 'tournamentId',
    });

    Tournament.hasMany(models.Match, {
      foreignKey: 'tournamentId',
    });
  };

  return Tournament;
};
