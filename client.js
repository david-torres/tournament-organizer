const API_BASE_URL = 'http://localhost:3000';

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

  const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
  const result = await response.json();
  return result;
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

async function createTournament(name) {
  const response = await apiCall('/tournaments', 'POST', { name });
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

module.exports = {
  searchMembers,
  createMember,
  getLatestTournament,
  createTournament,
  startTournament,
  getBracket,
  addParticipant,
  getParticipants,
  getMatches,
  updateMatch,
};
