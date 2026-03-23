const express = require('express');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const routes = require('./routes');

function createApp() {
  const app = express();

  app.use(morgan('combined'));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  routes(app);

  return app;
}

module.exports = {
  createApp,
};
