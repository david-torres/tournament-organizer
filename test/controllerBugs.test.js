const test = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');

const memberController = require('../controllers/memberController');
const tournamentController = require('../controllers/tournament/tournamentController');
const matchController = require('../controllers/tournament/matchController');
const bracketController = require('../controllers/tournament/bracketController');
const models = require('../models');
const utils = require('../utils');

function createRes() {
  return {
    statusCode: null,
    body: null,
    headers: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    writeHead(code, headers) {
      this.statusCode = code;
      this.headers = headers;
    },
    setHeader(name, value) {
      if (!this.headers) {
        this.headers = {};
      }

      this.headers[name] = value;
    },
    end(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('createTournament rejects invalid single-elimination size with 400', async () => {
  const req = {
    body: {
      name: 'Spring Bracket',
      type: 'single_elimination',
      size: 3,
    },
  };
  const res = createRes();

  await tournamentController.createTournament(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /power of 2/i);
});

test('createMember passes elo to the model layer', async () => {
  const originalCreate = models.Member.create;
  let receivedPayload = null;

  models.Member.create = async (payload) => {
    receivedPayload = payload;

    return {
      id: 1,
      ...payload,
    };
  };

  try {
    const req = {
      body: {
        name: 'Ada Lovelace',
      },
    };
    const res = createRes();

    await memberController.createMember(req, res);
    assert.deepStrictEqual(receivedPayload, {
      name: 'Ada Lovelace',
      elo: 1200,
    });
  } finally {
    models.Member.create = originalCreate;
  }
});

test('updateMatch rejects winners that are not part of the match with 400', async () => {
  const originalFindByPk = models.Tournament.findByPk;
  const originalFindOne = models.Match.findOne;

  models.Tournament.findByPk = async () => ({
    id: 42,
    type: 'single_elimination',
    status: 'in_progress',
    participants: [
      { id: 1 },
      { id: 2 },
    ],
    matches: [],
  });

  models.Match.findOne = async () => ({
    id: 7,
    player1: {
      id: 1,
      member: {
        id: 1,
        name: 'Player One',
        elo: 1200,
      },
    },
    player2: {
      id: 2,
      member: {
        id: 2,
        name: 'Player Two',
        elo: 1200,
      },
    },
    winner: null,
    update: async () => null,
  });

  try {
    const req = {
      params: {
        id: '42',
        match_id: '7',
      },
      body: {
        winner_id: 999,
      },
    };
    const res = createRes();

    await matchController.updateMatch(req, res);

    assert.equal(res.statusCode, 400);
  } finally {
    models.Tournament.findByPk = originalFindByPk;
    models.Match.findOne = originalFindOne;
  }
});

test('startTournament returns 400 when the atomic status transition loses the race', async () => {
  const originalTransaction = models.sequelize.transaction;
  const originalFindByPk = models.Tournament.findByPk;
  const originalUpdate = models.Tournament.update;
  const originalBulkCreate = models.Match.bulkCreate;

  let bulkCreateCalled = false;

  models.sequelize.transaction = async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } });
  models.Tournament.findByPk = async () => ({
    id: 11,
    status: 'pending',
    type: 'single_elimination',
    participants: [
      { id: 1 },
      { id: 2 },
    ],
  });
  models.Tournament.update = async () => [0];
  models.Match.bulkCreate = async () => {
    bulkCreateCalled = true;
  };

  try {
    const req = {
      params: {
        id: '11',
      },
    };
    const res = createRes();

    await tournamentController.startTournament(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(bulkCreateCalled, false);
  } finally {
    models.sequelize.transaction = originalTransaction;
    models.Tournament.findByPk = originalFindByPk;
    models.Tournament.update = originalUpdate;
    models.Match.bulkCreate = originalBulkCreate;
  }
});

test('createMatch maps SQLITE_BUSY lock contention to 409', async () => {
  const originalTransaction = models.sequelize.transaction;

  models.sequelize.transaction = async () => {
    throw new Error('SQLITE_BUSY: database is locked');
  };

  try {
    const req = {
      params: {
        id: '5',
      },
      body: {
        participant1: 1,
        participant2: 2,
      },
    };
    const res = createRes();

    await matchController.createMatch(req, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /unresolved match/i);
  } finally {
    models.sequelize.transaction = originalTransaction;
  }
});

test('updateMatch rejects replaying a completed match with 409', async () => {
  const originalTransaction = models.sequelize.transaction;
  const originalFindByPk = models.Tournament.findByPk;
  const originalFindOne = models.Match.findOne;

  models.sequelize.transaction = async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } });
  models.Tournament.findByPk = async () => ({
    id: 42,
    type: 'league',
    status: 'in_progress',
    participants: [],
    matches: [],
  });
  models.Match.findOne = async () => ({
    id: 7,
    winnerId: 1,
    player1: { id: 1, member: { id: 1, elo: 1200 } },
    player2: { id: 2, member: { id: 2, elo: 1200 } },
  });

  try {
    const req = {
      params: {
        id: '42',
        match_id: '7',
      },
      body: {
        winner_id: 1,
      },
    };
    const res = createRes();

    await matchController.updateMatch(req, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /already been completed/i);
  } finally {
    models.sequelize.transaction = originalTransaction;
    models.Tournament.findByPk = originalFindByPk;
    models.Match.findOne = originalFindOne;
  }
});

test('getBracket serializes a bye match without throwing', async () => {
  const originalFindByPk = models.Tournament.findByPk;
  const originalFindAll = models.Match.findAll;

  models.Tournament.findByPk = async () => ({
    id: 5,
    name: 'Bye Bracket',
  });

  models.Match.findAll = async () => ([
    {
      id: 10,
      round: 1,
      player1: {
        member: {
          id: 11,
          name: 'Solo Player',
        },
      },
      player2: null,
      winner: null,
    },
  ]);

  try {
    const req = {
      params: {
        id: '5',
      },
      query: {
        format: 'json',
      },
    };
    const res = createRes();

    await bracketController.getBracket(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepStrictEqual(res.body, {
      1: [
        {
          id: 10,
          round: 1,
          player1: {
            id: 11,
            name: 'Solo Player',
          },
          player2: null,
          winner: null,
        },
      ],
    });
  } finally {
    models.Tournament.findByPk = originalFindByPk;
    models.Match.findAll = originalFindAll;
  }
});

test('getBracket renders swiss bye brackets as an image without throwing', async () => {
  const originalFindByPk = models.Tournament.findByPk;
  const originalFindAll = models.Match.findAll;
  const originalGenerateBracketImage = utils.generateBracketImage;

  models.Tournament.findByPk = async () => ({
    id: 9,
    name: 'Bye Image Bracket',
    type: 'swiss',
  });

  models.Match.findAll = async () => ([
    {
      id: 12,
      round: 1,
      player1: {
        member: {
          id: 21,
          name: 'Image Solo',
        },
      },
      player2: null,
      winner: {
        member: {
          id: 21,
          name: 'Image Solo',
        },
      },
    },
  ]);

  utils.generateBracketImage = async (html) => {
    assert.match(html, /Image Solo/);
    assert.match(html, /BYE/);
    return Buffer.from('png');
  };

  try {
    const req = {
      params: {
        id: '9',
      },
      query: {
        format: 'image',
      },
    };
    const res = createRes();

    await bracketController.getBracket(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepStrictEqual(res.headers, { 'Content-Type': 'image/png' });
    assert.deepStrictEqual(res.body, Buffer.from('png'));
  } finally {
    models.Tournament.findByPk = originalFindByPk;
    models.Match.findAll = originalFindAll;
    utils.generateBracketImage = originalGenerateBracketImage;
  }
});

test('getBracket caches repeated image renders for the same tournament state', async () => {
  const originalFindByPk = models.Tournament.findByPk;
  const originalFindAll = models.Match.findAll;
  const originalRenderFile = ejs.renderFile;
  const originalGenerateBracketImage = utils.generateBracketImage;

  let renderCount = 0;
  let imageCount = 0;

  bracketController.bracketRenderCache.clear();

  models.Tournament.findByPk = async () => ({
    id: 14,
    name: 'Cached Bracket',
    type: 'single_elimination',
    updatedAt: '2026-03-24T00:00:00.000Z',
  });

  models.Match.findAll = async () => ([
    {
      id: 1,
      round: 1,
      player1Id: 1,
      player2Id: 2,
      winnerId: 1,
      updatedAt: '2026-03-24T00:00:00.000Z',
      player1: {
        member: {
          id: 1,
          name: 'Cached One',
        },
      },
      player2: {
        member: {
          id: 2,
          name: 'Cached Two',
        },
      },
      winner: {
        member: {
          id: 1,
          name: 'Cached One',
        },
      },
    },
  ]);

  ejs.renderFile = async () => {
    renderCount += 1;
    return '<html>cached bracket</html>';
  };

  utils.generateBracketImage = async () => {
    imageCount += 1;
    return Buffer.from('cached-png');
  };

  try {
    const req = {
      params: { id: '14' },
      query: { format: 'image' },
    };

    const firstRes = createRes();
    await bracketController.getBracket(req, firstRes);

    const secondRes = createRes();
    await bracketController.getBracket(req, secondRes);

    assert.equal(firstRes.statusCode, 200);
    assert.equal(secondRes.statusCode, 200);
    assert.equal(renderCount, 1);
    assert.equal(imageCount, 1);
  } finally {
    bracketController.bracketRenderCache.clear();
    models.Tournament.findByPk = originalFindByPk;
    models.Match.findAll = originalFindAll;
    ejs.renderFile = originalRenderFile;
    utils.generateBracketImage = originalGenerateBracketImage;
  }
});

test('decayElo batches last-match activity lookups instead of querying Match.findOne per participant', async () => {
  const originalFindByPk = models.Tournament.findByPk;
  const originalParticipantFindAll = models.Participant.findAll;
  const originalMatchFindAll = models.Match.findAll;
  const originalMatchFindOne = models.Match.findOne;

  let findAllCalls = 0;

  models.Tournament.findByPk = async () => ({
    id: 22,
    status: 'in_progress',
  });

  models.Participant.findAll = async () => ([
    {
      id: 1,
      elo: 1200,
      member: { id: 101, name: 'Decay One' },
      async update(values) {
        this.elo = values.elo;
        return this;
      },
    },
    {
      id: 2,
      elo: 1200,
      member: { id: 102, name: 'Decay Two' },
      async update(values) {
        this.elo = values.elo;
        return this;
      },
    },
  ]);

  models.Match.findAll = async ({ attributes }) => {
    findAllCalls += 1;

    if (attributes[0][0] === 'player1Id') {
      return [{ participantId: 1, lastActiveAt: '2026-03-10T00:00:00.000Z' }];
    }

    return [{ participantId: 2, lastActiveAt: '2026-03-10T00:00:00.000Z' }];
  };

  models.Match.findOne = async () => {
    throw new Error('decayElo should not fall back to Match.findOne');
  };

  try {
    const req = {
      params: { id: '22' },
    };
    const res = createRes();

    await tournamentController.decayElo(req, res);

    assert.equal(res.statusCode, null);
    assert.equal(findAllCalls, 2);
    assert.equal(res.body.participants.length, 2);
    assert.ok(res.body.participants.every((participant) => participant.elo_decay.penalty > 0));
  } finally {
    models.Tournament.findByPk = originalFindByPk;
    models.Participant.findAll = originalParticipantFindAll;
    models.Match.findAll = originalMatchFindAll;
    models.Match.findOne = originalMatchFindOne;
  }
});
