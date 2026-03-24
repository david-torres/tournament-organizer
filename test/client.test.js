const test = require('node:test');
const assert = require('node:assert/strict');

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_API_URL = process.env.TOURNAMENT_API_URL;

function createHeaders(headers = {}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    get(name) {
      return normalizedHeaders[name.toLowerCase()] ?? null;
    },
  };
}

function createResponse({
  ok = true,
  status = 200,
  headers = { 'content-type': 'application/json' },
  jsonBody = {},
  textBody = '',
  bufferBody = 'image-bytes',
} = {}) {
  return {
    ok,
    status,
    headers: createHeaders(headers),
    async json() {
      return jsonBody;
    },
    async text() {
      return textBody;
    },
    async arrayBuffer() {
      return Buffer.from(bufferBody);
    },
  };
}

function loadClient() {
  delete require.cache[require.resolve('../client')];
  return require('../client');
}

test.afterEach(() => {
  global.fetch = ORIGINAL_FETCH;

  if (ORIGINAL_API_URL === undefined) {
    delete process.env.TOURNAMENT_API_URL;
  } else {
    process.env.TOURNAMENT_API_URL = ORIGINAL_API_URL;
  }
});

test('searchMembers encodes the query string and forwards extra params', async () => {
  process.env.TOURNAMENT_API_URL = 'https://api.example.test';

  let receivedUrl = null;
  global.fetch = async (url) => {
    receivedUrl = url;
    return createResponse({ jsonBody: { rows: [] } });
  };

  const client = loadClient();
  const result = await client.searchMembers('Ada Lovelace & Co', { page: 2, limit: 10 });

  assert.deepEqual(result, { rows: [] });
  assert.equal(
    receivedUrl,
    'https://api.example.test/members/search?name=Ada+Lovelace+%26+Co&page=2&limit=10',
  );
});

test('getMatches does not append an empty query string', async () => {
  process.env.TOURNAMENT_API_URL = 'https://api.example.test';

  let receivedUrl = null;
  global.fetch = async (url) => {
    receivedUrl = url;
    return createResponse({ jsonBody: [] });
  };

  const client = loadClient();
  const result = await client.getMatches(42);

  assert.deepEqual(result, []);
  assert.equal(receivedUrl, 'https://api.example.test/tournaments/42/matches');
});

test('updateMatch accepts the richer match update payload shape', async () => {
  process.env.TOURNAMENT_API_URL = 'https://api.example.test';

  let receivedOptions = null;
  global.fetch = async (_url, options) => {
    receivedOptions = options;
    return createResponse({ jsonBody: { id: 7 } });
  };

  const client = loadClient();
  const result = await client.updateMatch(12, 7, {
    scheduled_at: '2026-03-24T10:00:00Z',
    location: 'Table 1',
    notes: 'Feature match',
    player1_score: 2,
    player2_score: 1,
    winner_id: 3,
  });

  assert.deepEqual(result, { id: 7 });
  assert.equal(receivedOptions.method, 'PATCH');
  assert.equal(receivedOptions.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(receivedOptions.body), {
    scheduled_at: '2026-03-24T10:00:00Z',
    location: 'Table 1',
    notes: 'Feature match',
    player1_score: 2,
    player2_score: 1,
    winner_id: 3,
  });
});

test('getBracket returns html text and image buffers for non-json formats', async () => {
  process.env.TOURNAMENT_API_URL = 'https://api.example.test';

  const responses = [
    createResponse({
      headers: { 'content-type': 'text/html; charset=utf-8' },
      textBody: '<html>bracket</html>',
    }),
    createResponse({
      headers: { 'content-type': 'image/png' },
      bufferBody: 'png-data',
    }),
  ];
  const receivedUrls = [];

  global.fetch = async (url) => {
    receivedUrls.push(url);
    return responses.shift();
  };

  const client = loadClient();
  const html = await client.getBracket(5, 'html');
  const image = await client.getBracket(5, 'image');

  assert.equal(html, '<html>bracket</html>');
  assert.ok(Buffer.isBuffer(image));
  assert.equal(image.toString(), 'png-data');
  assert.deepEqual(receivedUrls, [
    'https://api.example.test/tournaments/5/bracket?format=html',
    'https://api.example.test/tournaments/5/bracket?format=image',
  ]);
});

test('current route wrappers call the expected endpoints', async () => {
  process.env.TOURNAMENT_API_URL = 'https://api.example.test';

  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({
      url,
      method: options.method ?? 'GET',
      body: options.body ? JSON.parse(options.body) : null,
    });

    return createResponse({ jsonBody: { ok: true } });
  };

  const client = loadClient();
  await client.getTournaments({ status: 'pending' });
  await client.getTournament(1);
  await client.updateTournament(1, { status: 'archived' });
  await client.resetTournament(1);
  await client.deleteTournament(1);
  await client.updateParticipant(1, 2, { seed: 3 });
  await client.getStandings(1);
  await client.correctMatchResult(1, 4, { winner_id: 2, correction_reason: 'score typo' });

  assert.deepEqual(calls, [
    {
      url: 'https://api.example.test/tournaments?status=pending',
      method: 'GET',
      body: null,
    },
    {
      url: 'https://api.example.test/tournaments/1',
      method: 'GET',
      body: null,
    },
    {
      url: 'https://api.example.test/tournaments/1',
      method: 'PATCH',
      body: { status: 'archived' },
    },
    {
      url: 'https://api.example.test/tournaments/1/reset',
      method: 'POST',
      body: null,
    },
    {
      url: 'https://api.example.test/tournaments/1',
      method: 'DELETE',
      body: null,
    },
    {
      url: 'https://api.example.test/tournaments/1/participants/2',
      method: 'PATCH',
      body: { seed: 3 },
    },
    {
      url: 'https://api.example.test/tournaments/1/standings',
      method: 'GET',
      body: null,
    },
    {
      url: 'https://api.example.test/tournaments/1/matches/4/correct',
      method: 'POST',
      body: { winner_id: 2, correction_reason: 'score typo' },
    },
  ]);
});
