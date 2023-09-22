const Sequelize = require('sequelize');
const config = require('./config/config');
const MemberModel = require('./models/member');
const TournamentModel = require('./models/tournament');
const ParticipantModel = require('./models/participant');
const MatchModel = require('./models/match');

const sequelize = new Sequelize(config[config.env].database, config[config.env].username, config[config.env].password, {
  host: config[config.env].host,
  port: config[config.env].port,
  dialect: config[config.env].dialect,
  storage: config[config.env].storage,
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

sequelize.sync({ force: true })
  .then(() => {
    console.log('Database initialized successfully.');
  })
  .catch((error) => {
    console.error('Error initializing database:', error);
  });
