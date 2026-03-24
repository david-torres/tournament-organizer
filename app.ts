export {};

const express = require('express');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const routes = require('./routes');

function createApp() {
  const app = express();

  app.use(morgan('combined'));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  routes(app);

  return app;
}

module.exports = {
  createApp,
};
