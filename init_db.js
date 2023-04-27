const Sequelize = require('sequelize');
const config = require('./config');
const MemberModel = require('./models/member');
const TournamentModel = require('./models/tournament');
const ParticipantModel = require('./models/participant');
const MatchModel = require('./models/match');

const sequelize = new Sequelize(config.DB_NAME, config.DB_USERNAME, config.DB_PASSWORD, {
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

sequelize.sync({ force: true })
  .then(() => {
    console.log('Database initialized successfully.');
  })
  .catch((error) => {
    console.error('Error initializing database:', error);
  });
