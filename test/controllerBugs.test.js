const test = require('node:test');
const assert = require('node:assert/strict');

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
