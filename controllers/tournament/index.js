const tournamentController = require('./tournamentController');
const matchController = require('./matchController');
const bracketController = require('./bracketController');

module.exports = {
  ...tournamentController,
  ...matchController,
  ...bracketController,
};

