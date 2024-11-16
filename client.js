const TOURNAMENT_API_URL = process.env.TOURNAMENT_API_URL || 'http://localhost:3000';

async function apiCall(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${TOURNAMENT_API_URL}${endpoint}`, options);

  // Check if the response status code indicates an error.
  if (!response.ok) {
    const json = await response.json();
    const errorMessage = json.error || 'An error occurred';
    const error = new Error(errorMessage);
    error.status = response.status;
    throw error;
  }

  const result = await response.json();
  return result;
}

async function getMembers() {
  const response = await apiCall(`/members`);
  return response;
}

async function searchMembers(name) {
  const response = await apiCall(`/members/search?name=${name}`);
  return response;
}

async function createMember(name) {
  const response = await apiCall('/members', 'POST', { name });
  return response;
}

async function getLatestTournament() {
  const response = await apiCall('/tournaments/latest');
  return response;
}

async function createTournament(name, type, size) {
  const response = await apiCall('/tournaments', 'POST', { name, type, size });
  return response;
}

async function endTournament(tournament_id) {
  const response = await apiCall(`/tournaments/${tournament_id}/league`, 'POST');
  return response;
}

async function startTournament(tournament_id) {
  const response = await apiCall(`/tournaments/${tournament_id}/start`, 'POST');
  return response;
}

async function getBracket(tournament_id, format) {
  const response = await apiCall(`/tournaments/${tournament_id}/bracket?format=${format}`);
  return response;
}

async function addParticipant(tournament_id, member_id) {
  const response = await apiCall(`/tournaments/${tournament_id}/participants`, 'POST', { member_id });
  return response;
}

async function getParticipants(tournament_id) {
  const response = await apiCall(`/tournaments/${tournament_id}/participants`);
  return response;
}

async function getMatches(tournament_id, params = {}) {
  const qs = '?' + new URLSearchParams(params).toString()
  const response = await apiCall(`/tournaments/${tournament_id}/matches${qs}`);
  return response;
}

async function updateMatch(tournament_id, match_id, winner_id) {
  const response = await apiCall(`/tournaments/${tournament_id}/matches/${match_id}`, 'PATCH', { winner_id });
  return response;
}

async function createMatch(tournament_id, participant1, participant2) {
  const response = await apiCall(`/tournaments/${tournament_id}/matches`, 'POST', { participant1, participant2 });
  return response;
}

async function decayElo(tournament_id) {
  const response = await apiCall(`/tournaments/${tournament_id}/decay-elo`, 'POST');
  return response;
}

module.exports = {
  getMembers,
  searchMembers,
  createMember,
  getLatestTournament,
  createTournament,
  startTournament,
  endTournament,
  getBracket,
  addParticipant,
  getParticipants,
  getMatches,
  createMatch,
  updateMatch,
  decayElo,
};
