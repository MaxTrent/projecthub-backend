require('dotenv').config();
const express = require('express');
const config = require('./config/config');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Routes
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const feedbackRoutes = require('./routes/feedback');
const documentRoutes = require('./routes/documents');
const adminRoutes = require('./routes/admin');

const app = express();

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/feedback', feedbackRoutes); 
app.use('/api/documents', documentRoutes);
app.use('/api/admin', adminRoutes);

// Global error handler
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});

//shutdown
const shutdown = async (signal) => {
  console.log(`Received ${signal}, shutting down...`);
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT')); // Added SIGINT handler