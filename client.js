const TOURNAMENT_API_URL = process.env.TOURNAMENT_API_URL || 'http://localhost:3000';

function buildQueryString(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    searchParams.append(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

async function parseResponseBody(response, responseType = 'auto') {
  if (response.status === 204) {
    return null;
  }

  if (responseType === 'buffer') {
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
  }

  if (responseType === 'text') {
    return response.text();
  }

  if (responseType === 'json') {
    return response.json();
  }

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  if (contentType.startsWith('text/')) {
    return response.text();
  }

  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer);
}

async function getErrorMessage(response) {
  try {
    const payload = await parseResponseBody(response);

    if (payload && typeof payload === 'object' && 'error' in payload) {
      return payload.error;
    }

    if (typeof payload === 'string' && payload.length > 0) {
      return payload;
    }
  } catch (error) {
    // Fall through to the generic message when the error body cannot be parsed.
  }

  return 'An error occurred';
}

async function apiCall(endpoint, options = {}) {
  const {
    method = 'GET',
    body,
    query,
    responseType = 'auto',
  } = options;
  const requestOptions = {
    method,
    headers: {},
  };

  if (body !== undefined && body !== null) {
    requestOptions.headers['Content-Type'] = 'application/json';
    requestOptions.body = JSON.stringify(body);
  }

  const response = await fetch(`${TOURNAMENT_API_URL}${endpoint}${buildQueryString(query)}`, requestOptions);

  if (!response.ok) {
    const error = new Error(await getErrorMessage(response));
    error.status = response.status;
    throw error;
  }

  return parseResponseBody(response, responseType);
}

async function getMembers(params = {}) {
  return apiCall('/members', { query: params });
}

async function searchMembers(name, params = {}) {
  return apiCall('/members/search', { query: { name, ...params } });
}

async function createMember(name) {
  return apiCall('/members', {
    method: 'POST',
    body: { name },
  });
}

async function getTournaments(params = {}) {
  return apiCall('/tournaments', { query: params });
}

async function getLatestTournament() {
  return apiCall('/tournaments/latest');
}

async function getTournament(tournament_id) {
  return apiCall(`/tournaments/${tournament_id}`);
}

async function createTournament(name, type, size) {
  return apiCall('/tournaments', {
    method: 'POST',
    body: { name, type, size },
  });
}

async function updateTournament(tournament_id, updates) {
  return apiCall(`/tournaments/${tournament_id}`, {
    method: 'PATCH',
    body: updates,
  });
}

async function resetTournament(tournament_id) {
  return apiCall(`/tournaments/${tournament_id}/reset`, {
    method: 'POST',
  });
}

async function deleteTournament(tournament_id) {
  return apiCall(`/tournaments/${tournament_id}`, {
    method: 'DELETE',
  });
}

async function endTournament(tournament_id) {
  return apiCall(`/tournaments/${tournament_id}/league`, {
    method: 'POST',
  });
}

async function startTournament(tournament_id) {
  return apiCall(`/tournaments/${tournament_id}/start`, {
    method: 'POST',
  });
}

async function getBracket(tournament_id, format = 'json') {
  const responseType = format === 'image' ? 'buffer' : format === 'html' ? 'text' : 'json';

  return apiCall(`/tournaments/${tournament_id}/bracket`, {
    query: { format },
    responseType,
  });
}

async function addParticipant(tournament_id, member_id, options = {}) {
  return apiCall(`/tournaments/${tournament_id}/participants`, {
    method: 'POST',
    body: { member_id, ...options },
  });
}

async function getParticipants(tournament_id, params = {}) {
  return apiCall(`/tournaments/${tournament_id}/participants`, {
    query: params,
  });
}

async function updateParticipant(tournament_id, participant_id, updates) {
  return apiCall(`/tournaments/${tournament_id}/participants/${participant_id}`, {
    method: 'PATCH',
    body: updates,
  });
}

async function getStandings(tournament_id) {
  return apiCall(`/tournaments/${tournament_id}/standings`);
}

async function getMatches(tournament_id, params = {}) {
  return apiCall(`/tournaments/${tournament_id}/matches`, {
    query: params,
  });
}

async function createMatch(tournament_id, participant1, participant2, options = {}) {
  return apiCall(`/tournaments/${tournament_id}/matches`, {
    method: 'POST',
    body: { participant1, participant2, ...options },
  });
}

async function updateMatch(tournament_id, match_id, updatesOrWinnerId) {
  const body = typeof updatesOrWinnerId === 'object' && updatesOrWinnerId !== null
    ? updatesOrWinnerId
    : { winner_id: updatesOrWinnerId };

  return apiCall(`/tournaments/${tournament_id}/matches/${match_id}`, {
    method: 'PATCH',
    body,
  });
}

async function correctMatchResult(tournament_id, match_id, updates) {
  return apiCall(`/tournaments/${tournament_id}/matches/${match_id}/correct`, {
    method: 'POST',
    body: updates,
  });
}

async function decayElo(tournament_id) {
  return apiCall(`/tournaments/${tournament_id}/decay-elo`, {
    method: 'POST',
  });
}

module.exports = {
  addParticipant,
  correctMatchResult,
  createMatch,
  createMember,
  createTournament,
  decayElo,
  deleteTournament,
  endTournament,
  getBracket,
  getLatestTournament,
  getMatches,
  getMembers,
  getParticipants,
  getStandings,
  getTournament,
  getTournaments,
  resetTournament,
  searchMembers,
  startTournament,
  updateMatch,
  updateParticipant,
  updateTournament,
};
