const memberController = require('./controllers/memberController');
const tournamentController = require('./controllers/tournamentController');

module.exports = function (app) {
  // Members
  app.post('/members', (req, res) => memberController.createMember(req, res));
  app.get('/members', (req, res) => memberController.getMembers(req, res));
  app.get('/members/search', (req, res) => memberController.searchMembers(req, res));

  // Tournaments
  app.post('/tournaments', (req, res) => tournamentController.createTournament(req, res));
  app.get('/tournaments/latest', (req, res) => tournamentController.getLatestTournament(req, res));
  app.post('/tournaments/:id/start', (req, res) => tournamentController.startTournament(req, res));

  // Bracket
  app.get('/tournaments/:id/bracket', (req, res) => tournamentController.getBracket(req, res));

  // Participants
  app.post('/tournaments/:id/participants', (req, res) => tournamentController.addParticipant(req, res));
  app.get('/tournaments/:id/participants', (req, res) => tournamentController.getParticipants(req, res));

  // Matches
  app.get('/tournaments/:id/matches', (req, res) => tournamentController.getMatches(req, res));
  app.patch('/tournaments/:id/matches/:match_id', (req, res) => tournamentController.updateMatch(req, res));
};
