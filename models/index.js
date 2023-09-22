const { Sequelize } = require('sequelize');
const MemberModel = require('./member');
const TournamentModel = require('./tournament');
const ParticipantModel = require('./participant');
const MatchModel = require('./match');
const config = require('../config/config');

const sequelize = new Sequelize(config[config.env].database, config[config.env].username, config[config.env].password, {
  host: config[config.env].host,
  port: config[config.env].port,
  dialect: config[config.env].dialect,
  storage: config[config.env].storage,
});

const models = {
  sequelize,
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

module.exports = models;
