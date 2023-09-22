require('dotenv').config();

module.exports = {
    development: {
        "username": process.env.DB_USERNAME,
        "password": process.env.DB_PASSWORD,
        "database": process.env.DB_NAME,
        "host": process.env.DB_HOST,
        "db_port": process.env.DB_PORT,
        "dialect": process.env.DB_DIALECT,
        "storage": process.env.DB_STORAGE,
        "port": process.env.PORT,
    },
    test: {
        "username": "root",
        "password": null,
        "database": "database_test",
        "host": "127.0.0.1",
        "dialect": "mysql",
    },
    production: {
        "username": process.env.DB_USERNAME,
        "password": process.env.DB_PASSWORD,
        "database": process.env.DB_NAME,
        "host": process.env.DB_HOST,
        "db_port": process.env.DB_PORT,
        "dialect": process.env.DB_DIALECT,
        "storage": process.env.DB_STORAGE,
        "port": process.env.PORT,
    },
    env: process.env.NODE_ENV,
};