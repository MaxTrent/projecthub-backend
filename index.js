// app.js
require('dotenv').config();
const express = require('express');
const config = require('./config/config');
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const feedbackRoutes = require('./routes/feedback');
const documentRoutes = require('./routes/documents');
const path = require('path');

const app = express();

// Middleware
app.use(express.json());

// Serve static files from uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/projects', feedbackRoutes);
app.use('/api/documents', documentRoutes);

// Start server
app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});