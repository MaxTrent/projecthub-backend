// config/config.js
require('dotenv').config();

const config = {
  db: {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: '1h'
  },
  port: process.env.PORT || 3000
};

module.exports = config;