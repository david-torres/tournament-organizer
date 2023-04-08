const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const morgan = require('morgan');
const config = require('./config');
const routes = require('./routes');

const app = express();
const db = new sqlite3.Database(config.DATABASE_URL);

app.use(morgan('combined'))
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Register routes
routes(app, db);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Close the database connection on exit
process.on('exit', () => {
    db.close();
});
