const express = require('express');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const config = require('./config/config');
const routes = require('./routes');
const { sequelize } = require('./models/index');

const app = express();

app.use(morgan('combined'))
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Register routes
routes(app);

sequelize.authenticate()
    .then(() => {
        console.log('Connection to the database has been established successfully.');
        app.listen(config[config.env].port, () => {
            console.log(`Tournament management API is running on port ${config[config.env].port}`);
        });
    })
    .catch((error) => {
        console.error('Unable to connect to the database:', error);
    });

module.exports = app;