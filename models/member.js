module.exports = (sequelize, DataTypes) => {
  const Member = sequelize.define('Member', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    elo: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 1200,
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

  Member.associate = models => {
    Member.hasMany(models.Participant, {
      foreignKey: 'memberId',
    });
  };

  return Member;
};
