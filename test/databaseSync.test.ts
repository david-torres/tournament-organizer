export {};

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Sequelize } = require('sequelize');

async function createLegacyDatabase(storagePath) {
  const legacy = new Sequelize({
    dialect: 'sqlite',
    storage: storagePath,
    logging: false,
  });

  await legacy.query(`
    CREATE TABLE "Member" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "name" VARCHAR(255) NOT NULL UNIQUE,
      "elo" FLOAT NOT NULL DEFAULT 1200,
      "createdAt" DATETIME NOT NULL,
      "updatedAt" DATETIME NOT NULL
    )
  `);

  await legacy.query(`
    CREATE TABLE "Tournament" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "name" VARCHAR(255) NOT NULL,
      "type" VARCHAR(255) NOT NULL DEFAULT 'single_elimination',
      "size" INTEGER,
      "status" VARCHAR(255) NOT NULL DEFAULT 'pending',
      "createdAt" DATETIME NOT NULL,
      "updatedAt" DATETIME NOT NULL
    )
  `);

  await legacy.query(`
    CREATE TABLE "Participant" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "memberId" INTEGER NOT NULL,
      "tournamentId" INTEGER NOT NULL,
      "elo" FLOAT NOT NULL DEFAULT 1200,
      "createdAt" DATETIME NOT NULL,
      "updatedAt" DATETIME NOT NULL
    )
  `);

  await legacy.query(`
    CREATE TABLE "Match" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "round" INTEGER NOT NULL,
      "player1Id" INTEGER NOT NULL,
      "player2Id" INTEGER,
      "winnerId" INTEGER,
      "tournamentId" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL,
      "updatedAt" DATETIME NOT NULL
    )
  `);

  await legacy.close();
}

function resetModule(modulePath) {
  delete require.cache[require.resolve(modulePath)];
}

function resetRuntimeModules() {
  resetModule('../config/config');
  resetModule('../models');
}

test('shouldRepairStaleSchema retries column-missing postgres errors only when sync is not already altering', { concurrency: false }, async () => {
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    DB_DIALECT: process.env.DB_DIALECT,
    DB_STORAGE: process.env.DB_STORAGE,
    DB_NAME: process.env.DB_NAME,
    DB_HOST: process.env.DB_HOST,
    DB_PORT: process.env.DB_PORT,
    DB_SCHEMA: process.env.DB_SCHEMA,
    DB_USERNAME: process.env.DB_USERNAME,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_LOGGING: process.env.DB_LOGGING,
  };

  process.env.NODE_ENV = 'production';
  process.env.DB_DIALECT = 'postgres';
  process.env.DB_NAME = 'legacy';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '5432';
  process.env.DB_SCHEMA = '';
  process.env.DB_USERNAME = 'postgres';
  process.env.DB_PASSWORD = 'postgres';
  process.env.DB_STORAGE = '';
  process.env.DB_LOGGING = 'false';

  resetRuntimeModules();

  const models = require('../models');

  try {
    assert.equal(models.shouldRepairStaleSchema({
      original: {
        code: '42703',
        message: 'column "seed" does not exist',
      },
    }), true);

    assert.equal(models.shouldRepairStaleSchema({
      original: {
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      },
    }), false);

    assert.equal(models.shouldRepairStaleSchema({
      original: {
        code: '42703',
        message: 'column "seed" does not exist',
      },
    }, { alter: true }), false);
  } finally {
    await models.sequelize.close().catch(() => {});

    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });

    resetRuntimeModules();
  }
});

test('syncDatabase repairs a stale development sqlite schema by retrying with alter', { concurrency: false }, async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tournament-organizer-sync-'));
  const storagePath = path.join(tempDir, 'legacy.db');
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    DB_DIALECT: process.env.DB_DIALECT,
    DB_STORAGE: process.env.DB_STORAGE,
    DB_NAME: process.env.DB_NAME,
    DB_HOST: process.env.DB_HOST,
    DB_PORT: process.env.DB_PORT,
    DB_SCHEMA: process.env.DB_SCHEMA,
    DB_USERNAME: process.env.DB_USERNAME,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_LOGGING: process.env.DB_LOGGING,
  };

  await createLegacyDatabase(storagePath);

  process.env.NODE_ENV = 'development';
  process.env.DB_DIALECT = 'sqlite';
  process.env.DB_STORAGE = storagePath;
  process.env.DB_NAME = 'legacy';
  process.env.DB_HOST = '';
  process.env.DB_PORT = '';
  process.env.DB_SCHEMA = '';
  process.env.DB_USERNAME = '';
  process.env.DB_PASSWORD = '';
  process.env.DB_LOGGING = 'false';

  resetRuntimeModules();

  const models = require('../models');

  try {
    await models.authenticateDatabase();
    await models.syncDatabase();

    const matchTable = await models.sequelize.getQueryInterface().describeTable('Match');
    const participantTable = await models.sequelize.getQueryInterface().describeTable('Participant');
    const tournamentTable = await models.sequelize.getQueryInterface().describeTable('Tournament');
    const indexes = await models.sequelize.getQueryInterface().showIndex('Match');

    assert.ok(matchTable.bracket);
    assert.ok(matchTable.position);
    assert.ok(matchTable.resultType);
    assert.ok(matchTable.correctionCount);
    assert.ok(participantTable.seed);
    assert.ok(tournamentTable.winnerId);
    assert.ok(indexes.some((index) => index.fields.some((field) => field.attribute === 'bracket')));
  } finally {
    await models.sequelize.close();

    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });

    resetRuntimeModules();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('postgres DB_SCHEMA applies a default schema and searchPath for Sequelize models', { concurrency: false }, async () => {
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    DB_DIALECT: process.env.DB_DIALECT,
    DB_STORAGE: process.env.DB_STORAGE,
    DB_NAME: process.env.DB_NAME,
    DB_HOST: process.env.DB_HOST,
    DB_PORT: process.env.DB_PORT,
    DB_SCHEMA: process.env.DB_SCHEMA,
    DB_USERNAME: process.env.DB_USERNAME,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_LOGGING: process.env.DB_LOGGING,
  };

  process.env.NODE_ENV = 'production';
  process.env.DB_DIALECT = 'postgres';
  process.env.DB_NAME = 'legacy';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '5432';
  process.env.DB_SCHEMA = 'league_ops';
  process.env.DB_USERNAME = 'postgres';
  process.env.DB_PASSWORD = 'postgres';
  process.env.DB_STORAGE = '';
  process.env.DB_LOGGING = 'false';

  resetRuntimeModules();

  const models = require('../models');

  try {
    assert.equal(models.sequelize.options.searchPath, 'league_ops');
    assert.equal(models.Member.getTableName().schema, 'league_ops');
    assert.equal(models.Match.getTableName().schema, 'league_ops');
    assert.equal(models.buildSequelizeOptions().define.schema, 'league_ops');
  } finally {
    await models.sequelize.close().catch(() => {});

    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });

    resetRuntimeModules();
  }
});
