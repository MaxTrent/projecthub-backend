// app.js
require('dotenv').config();
const express = require('express');
const config = require('./config/config');
const authRoutes = require('./routes/auth');

const app = express();

// Middleware
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);

// Start server
app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});