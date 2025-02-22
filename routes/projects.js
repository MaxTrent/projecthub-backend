// routes/projects.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const config = require('../config/config');

// Database pool
const pool = new Pool(config.db);

// JWT secret
const JWT_SECRET = config.jwt.secret;

// Multer configuration (from previous implementation)
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF and Word documents are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: fileFilter
});

// Authentication middleware
const auth = (requiredRole) => {
  return async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const userId = decoded.userId;
      const userRole = decoded.role;

      if (requiredRole && userRole !== requiredRole) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      req.user = { id: userId, role: userRole };
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
};

// Previous upload endpoint
router.post(
  '/upload',
  auth('student'),
  upload.single('file'),
  async (req, res) => {
    const { title, abstract, keywords } = req.body;
    const file = req.file;

    if (!title || !abstract || !keywords || !file) {
      return res.status(400).json({ error: 'All fields and file are required' });
    }

    try {
      const fileUrl = `/uploads/${file.filename}`;
      const studentId = req.user.id;

      const result = await pool.query(
        `INSERT INTO projects (title, abstract, keywords, student_id, status, file_url, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [title, abstract, keywords, studentId, 'draft', fileUrl, new Date()]
      );

      const projectId = result.rows[0].id;

      res.status(201).json({
        projectId,
        message: 'Project uploaded successfully'
      });
    } catch (error) {
      console.error('Project upload error:', error);
      res.status(500).json({ error: 'Server error during project upload' });
    }
  }
);

// NEW: Get project status history
router.get('/status/:projectId', auth('student'), async (req, res) => {
  const { projectId } = req.params;
  const studentId = req.user.id;

  try {
    // Verify project exists and belongs to the student
    const projectResult = await pool.query(
      'SELECT id, title, status FROM projects WHERE id = $1 AND student_id = $2',
      [projectId, studentId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found or unauthorized' });
    }

    const project = projectResult.rows[0];

    // Get status updates
    const updatesResult = await pool.query(
      `SELECT status, comments, updated_at 
       FROM status_updates 
       WHERE project_id = $1 
       ORDER BY updated_at DESC`,
      [projectId]
    );

    const updates = updatesResult.rows.map(update => ({
      date: update.updated_at,
      status: update.status,
      comments: update.comments || ''
    }));

    res.json({
      title: project.title,
      status: project.status,
      updates
    });
  } catch (error) {
    console.error('Status fetch error:', error);
    res.status(500).json({ error: 'Server error fetching project status' });
  }
});

// NEW: Update project status (supervisor only)
router.post('/status/:projectId', auth('supervisor'), async (req, res) => {
  const { projectId } = req.params;
  const { status, comments } = req.body;

  // Validate input
  const validStatuses = ['draft', 'submitted', 'under_review', 'approved'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Valid status is required' });
  }

  try {
    // Verify project exists
    const projectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1',
      [projectId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert status update
      await client.query(
        'INSERT INTO status_updates (project_id, status, comments, updated_at) VALUES ($1, $2, $3, $4)',
        [projectId, status, comments || null, new Date()]
      );

      // Update project status
      await client.query(
        'UPDATE projects SET status = $1 WHERE id = $2',
        [status, projectId]
      );

      await client.query('COMMIT');
      res.status(200).json({ message: 'Project status updated successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Status update error:', error);
    res.status(500).json({ error: 'Server error updating project status' });
  }
});

// Multer error handling (from previous implementation)
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds 50MB limit' });
    }
    return res.status(400).json({ error: error.message });
  } else if (error) {
    return res.status(400).json({ error: error.message });
  }
  next();
});

module.exports = router;