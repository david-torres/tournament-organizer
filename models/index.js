const { Sequelize } = require('sequelize');
const MemberModel = require('./member');
const TournamentModel = require('./tournament');
const ParticipantModel = require('./participant');
const MatchModel = require('./match');
const config = require('../config/config');

const runtimeConfig = config[config.env];

const sequelize = new Sequelize(runtimeConfig.database, runtimeConfig.username, runtimeConfig.password, {
  host: runtimeConfig.host,
  port: runtimeConfig.port,
  dialect: runtimeConfig.dialect,
  logging: runtimeConfig.logging ? console.log : false,
  storage: runtimeConfig.storage,
});

const db = {
  sequelize,
  Member: MemberModel(sequelize, Sequelize),
  Tournament: TournamentModel(sequelize, Sequelize),
  Participant: ParticipantModel(sequelize, Sequelize),
  Match: MatchModel(sequelize, Sequelize),
};

Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

async function authenticateDatabase() {
  await sequelize.authenticate();
}

async function syncDatabase(options = {}) {
  await sequelize.sync(options);
}

module.exports = {
  ...db,
  authenticateDatabase,
  syncDatabase,
};
