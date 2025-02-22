require('dotenv').config();
const express = require('express');
const config = require('./config/config');
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const feedbackRoutes = require('./routes/feedback');
const documentRoutes = require('./routes/documents');
const adminRoutes = require('./routes/admin');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/projects', feedbackRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/admin', adminRoutes);


app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
  });
  
app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});

//shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});