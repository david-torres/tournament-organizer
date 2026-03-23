const { authenticateDatabase, syncDatabase } = require('./models');

const initializeDatabase = async () => {
  try {
    await authenticateDatabase();
    await syncDatabase({ force: true });
    console.log('Database initialized successfully.');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
};

if (require.main === module) {
  initializeDatabase();
}

module.exports = {
  initializeDatabase,
};
