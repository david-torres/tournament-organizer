const { Sequelize } = require('sequelize');
const MemberModel = require('./member');
const TournamentModel = require('./tournament');
const ParticipantModel = require('./participant');
const MatchModel = require('./match');
const config = require('../config');

const sequelize = new Sequelize({
  host: config.DB_HOST,
  dialect: config.DB_DIALECT,
  storage: config.DB_STORAGE,
});

const models = {
  Member: MemberModel(sequelize, Sequelize),
  Tournament: TournamentModel(sequelize, Sequelize),
  Participant: ParticipantModel(sequelize, Sequelize),
  Match: MatchModel(sequelize, Sequelize),
}

// Set up associations
Object.keys(models).forEach((modelName) => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

sequelize.sync();

module.exports = {
  sequelize,
  Member: models.Member,
  Tournament: models.Tournament,
  Participant: models.Participant,
  Match: models.Match,
};
