const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
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

// Authentication middleware (reused from previous modules)
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

// POST feedback endpoint (supervisor only)
router.post('/feedback/:projectId', auth('supervisor'), async (req, res) => {
  const { projectId } = req.params;
  const { comments } = req.body;
  const supervisorId = req.user.userId;

  // Validate input
  if (!comments) {
    return res.status(400).json({ error: 'Comments are required' });
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

    // Insert feedback
    await pool.query(
      `INSERT INTO feedback (project_id, supervisor_id, comments, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [projectId, supervisorId, comments]
    );

    res.status(201).json({ message: 'Feedback submitted' });
  } catch (error) {
    console.error('Feedback submission error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET feedback endpoint (student or supervisor)
router.get('/feedback/:projectId', auth(), async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.userId;
  const userRole = req.user.role;

  try {
    // Verify project exists and user has access
    let projectQuery;
    if (userRole === 'student') {
      projectQuery = await pool.query(
        `SELECT p.id
         FROM projects p
         WHERE p.id = $1 AND p.student_id = $2`,
        [projectId, userId]
      );
    } else if (userRole === 'supervisor') {
      projectQuery = await pool.query(
        `SELECT p.id
         FROM projects p
         WHERE p.id = $1 AND (p.supervisor_id = $2 OR p.supervisor_id IS NULL)`,
        [projectId, userId]
      );
    } else {
      return res.status(403).json({ error: 'Unauthorized role' });
    }

    if (projectQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found or unauthorized' });
    }

    // Retrieve feedback
    const feedbackResult = await pool.query(
      `SELECT f.id, f.comments, f.created_at
       FROM feedback f
       WHERE f.project_id = $1
       ORDER BY f.created_at DESC`,
      [projectId]
    );

    const feedback = feedbackResult.rows.map(f => ({
      id: f.id,
      comments: f.comments,
      created_at: f.created_at
    }));

    res.json(feedback);
  } catch (error) {
    console.error('Feedback retrieval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// General error handling
router.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

module.exports = router;