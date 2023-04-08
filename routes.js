const memberController = require('./controllers/memberController');
const tournamentController = require('./controllers/tournamentController');

module.exports = function (app, db) {
  // Members
  app.post('/members', (req, res) => memberController.createMember(req, res, db));
  app.get('/members', (req, res) => memberController.getMembers(req, res, db));
  app.get('/members/search', (req, res) => memberController.searchMembers(req, res, db));

  // Tournaments
  app.post('/tournaments', (req, res) => tournamentController.createTournament(req, res, db));

  // Participants
  app.post('/tournaments/:id/participants', (req, res) => tournamentController.addParticipant(req, res, db));
  app.get('/tournaments/:id/participants', (req, res) => tournamentController.getParticipants(req, res, db));

  // Matches
  app.get('/tournaments/:id/matches', (req, res) => tournamentController.getMatches(req, res, db));
  app.post('/tournaments/:id/generate_matches', (req, res) => tournamentController.generateMatches(req, res, db));
  app.put('/tournaments/:id/matches/:match_id', (req, res) => tournamentController.updateMatch(req, res, db));

  // Bracket
  app.get('/tournaments/:id/bracket', (req, res) => tournamentController.getBracket(req, res, db));
};
