const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { DATABASE_URL } = require('./config');

const schema = fs.readFileSync('./database.sql', 'utf8');

const db = new sqlite3.Database(DATABASE_URL, (err) => {
  if (err) {
    console.error(err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

db.exec(schema, (err) => {
  if (err) {
    console.error(err.message);
  } else {
    console.log('Database schema successfully loaded.');
  }
});

db.close((err) => {
  if (err) {
    console.error(err.message);
  } else {
    console.log('Closed the database connection.');
  }
});
