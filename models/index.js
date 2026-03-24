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

function shouldRepairStaleSchema(error, options = {}) {
  if (options.force || options.alter) {
    return false;
  }

  if (runtimeConfig.dialect === 'sqlite' && config.env !== 'development') {
    return false;
  }

  if (runtimeConfig.dialect !== 'sqlite' && runtimeConfig.dialect !== 'postgres') {
    return false;
  }

  const message = error?.original?.message || error?.message || '';
  const code = error?.original?.code || error?.parent?.code || error?.code || '';

  if (runtimeConfig.dialect === 'sqlite') {
    return /SQLITE_ERROR:\s*no such column:/i.test(message);
  }

  return code === '42703' || /column\s+"?.+"?\s+does not exist/i.test(message);
}

async function syncDatabase(options = {}) {
  try {
    await sequelize.sync(options);
  } catch (error) {
    if (!shouldRepairStaleSchema(error, options)) {
      throw error;
    }

    console.warn(`Detected stale ${runtimeConfig.dialect} schema. Retrying sync with alter to repair missing columns.`);
    await sequelize.sync({
      ...options,
      alter: {
        drop: false,
      },
    });
  }
}

module.exports = {
  ...db,
  authenticateDatabase,
  shouldRepairStaleSchema,
  syncDatabase,
};
