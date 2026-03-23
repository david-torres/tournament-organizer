const config = require('./config/config');
const { createApp } = require('./app');
const { authenticateDatabase, syncDatabase } = require('./models');

async function startServer(port = config[config.env].server_port) {
  const app = createApp();

  await authenticateDatabase();
  await syncDatabase();

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log('Connection to the database has been established successfully.');
      console.log(`Tournament management API is running on port ${port}`);
      resolve(server);
    });

    server.on('error', reject);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Unable to start the tournament management API:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  startServer,
};
