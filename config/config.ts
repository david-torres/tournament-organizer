export {};

require('dotenv').config();

const env = process.env.NODE_ENV || 'development';

function readRuntimeConfig(overrides = {}) {
  return {
    username: process.env.DB_USERNAME || null,
    password: process.env.DB_PASSWORD || null,
    database: process.env.DB_NAME || 'tournament_organizer',
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
    dialect: process.env.DB_DIALECT || 'sqlite',
    schema: process.env.DB_SCHEMA || undefined,
    storage: process.env.DB_STORAGE || './data/tournaments.db',
    server_port: process.env.PORT ? Number(process.env.PORT) : 3000,
    logging: process.env.DB_LOGGING === 'true',
    ...overrides,
  };
}

module.exports = {
  development: readRuntimeConfig(),
  test: readRuntimeConfig({
    database: 'tournament_organizer_test',
    logging: false,
    storage: ':memory:',
    server_port: 0,
  }),
  production: readRuntimeConfig(),
  env,
};
