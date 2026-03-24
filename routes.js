const memberController = require('./controllers/memberController');
const tournamentController = require('./controllers/tournament');

module.exports = function (app) {
  // Members
  app.post('/members', (req, res) => memberController.createMember(req, res));
  app.get('/members', (req, res) => memberController.getMembers(req, res));
  app.get('/members/search', (req, res) => memberController.searchMembers(req, res));

  // Tournaments
  app.get('/tournaments', (req, res) => tournamentController.getTournaments(req, res));
  app.post('/tournaments', (req, res) => tournamentController.createTournament(req, res));
  app.get('/tournaments/latest', (req, res) => tournamentController.getLatestTournament(req, res));
  app.get('/tournaments/:id', (req, res) => tournamentController.getTournament(req, res));
  app.patch('/tournaments/:id', (req, res) => tournamentController.updateTournament(req, res));
  app.post('/tournaments/:id/reset', (req, res) => tournamentController.resetTournament(req, res));
  app.delete('/tournaments/:id', (req, res) => tournamentController.deleteTournament(req, res));
  app.post('/tournaments/:id/start', (req, res) => tournamentController.startTournament(req, res));

  // Bracket
  app.get('/tournaments/:id/bracket', (req, res) => tournamentController.getBracket(req, res));

  // Participants
  app.post('/tournaments/:id/participants', (req, res) => tournamentController.addParticipant(req, res));
  app.get('/tournaments/:id/participants', (req, res) => tournamentController.getParticipants(req, res));
  app.get('/tournaments/:id/standings', (req, res) => tournamentController.getStandings(req, res));

  // Matches
  app.get('/tournaments/:id/matches', (req, res) => tournamentController.getMatches(req, res));
  app.post('/tournaments/:id/matches', (req, res) => tournamentController.createMatch(req, res));
  app.patch('/tournaments/:id/matches/:match_id', (req, res) => tournamentController.updateMatch(req, res));

  // Leagues
  app.post('/tournaments/:id/league', (req, res) => tournamentController.endTournament(req, res));
  app.post('/tournaments/:id/decay-elo', (req, res) => tournamentController.decayElo(req, res));
};
