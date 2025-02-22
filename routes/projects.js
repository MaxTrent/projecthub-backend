const express = require('express');
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// PostgreSQL connection pool
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432
});

// Multer configuration
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /pdf|doc|docx/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only PDF and Word documents are allowed'));
  }
});

// Authentication middleware
const auth = (requiredRole) => {
  return async (req, res, next) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      if (requiredRole && decoded.role !== requiredRole) {
        return res.status(403).json({ error: 'Unauthorized: Invalid role' });
      }

      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
};

// Project upload endpoint (from previous prompt)
router.post('/upload', 
  auth('student'),
  upload.single('file'),
  async (req, res) => {
    const { title, abstract, keywords } = req.body;
    const file = req.file;

    if (!title || !abstract || !keywords || !file) {
      return res.status(400).json({ error: 'All fields and file are required' });
    }

    try {
      const studentId = req.user.userId;
      const fileUrl = `/uploads/${file.filename}`;

      const result = await pool.query(
        `INSERT INTO projects (
          title, abstract, keywords, student_id, status, file_url, created_at
        ) VALUES ($1, $2, $3, $4, 'draft', $5, NOW()) RETURNING id`,
        [title, abstract, keywords, studentId, fileUrl]
      );

      const projectId = result.rows[0].id;

      res.status(201).json({
        projectId,
        message: 'Project uploaded successfully'
      });
    } catch (error) {
      console.error('Project upload error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET status history endpoint (new)
router.get('/status/:projectId', auth('student'), async (req, res) => {
  const { projectId } = req.params;
  const studentId = req.user.userId;

  try {
    const projectResult = await pool.query(
      `SELECT p.id, p.title, p.status
       FROM projects p
       WHERE p.id = $1 AND p.student_id = $2`,
      [projectId, studentId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found or unauthorized' });
    }

    const project = projectResult.rows[0];

    const updatesResult = await pool.query(
      `SELECT su.status, su.comments, su.updated_at AS date
       FROM status_updates su
       WHERE su.project_id = $1
       ORDER BY su.updated_at DESC`,
      [projectId]
    );

    const updates = updatesResult.rows.map(update => ({
      date: update.date,
      status: update.status,
      comments: update.comments || null
    }));

    res.json({
      title: project.title,
      status: project.status,
      updates
    });
  } catch (error) {
    console.error('Status fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST status update endpoint (new)
router.post('/status/:projectId', auth('supervisor'), async (req, res) => {
  const { projectId } = req.params;
  const { status, comments } = req.body;

  const validStatuses = ['draft', 'submitted', 'under_review', 'approved'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Valid status is required' });
  }

  try {
    const projectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1',
      [projectId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO status_updates (project_id, status, comments, updated_at)
         VALUES ($1, $2, $3, NOW())`,
        [projectId, status, comments || null]
      );

      await client.query(
        'UPDATE projects SET status = $1 WHERE id = $2',
        [status, projectId]
      );

      await client.query('COMMIT');
      res.status(200).json({ message: 'Status updated successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Status update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Multer error handling middleware
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds 50MB limit' });
    }
    return res.status(400).json({ error: error.message });
  }
  next(error);
});

// General error handling
router.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

module.exports = router;