const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = {
  connect: async () => {
    try {
      await pool.connect();
      console.log('Connected to PostgreSQL');
    } catch (err) {
      console.error('Database connection error:', err);
    }
  },
  query: (text, params) => pool.query(text, params),
};