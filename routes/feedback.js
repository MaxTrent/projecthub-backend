// routes/feedback.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const config = require('../config/config');

// Database pool
const pool = new Pool(config.db);

// JWT secret
const JWT_SECRET = config.jwt.secret;

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

// POST feedback endpoint (supervisor only)
router.post('/feedback/:projectId', auth('supervisor'), async (req, res) => {
  const { projectId } = req.params;
  const { comments } = req.body;
  const supervisorId = req.user.id;

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
      'INSERT INTO feedback (project_id, supervisor_id, comments, created_at) VALUES ($1, $2, $3, $4)',
      [projectId, supervisorId, comments, new Date()]
    );

    res.status(201).json({ message: 'Feedback submitted' });
  } catch (error) {
    console.error('Feedback submission error:', error);
    res.status(500).json({ error: 'Server error submitting feedback' });
  }
});

// GET feedback endpoint (student or supervisor)
router.get('/feedback/:projectId', auth(), async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    // Check if user is student owning the project or a supervisor
    let query;
    let values;

    if (userRole === 'student') {
      query = `
        SELECT f.id, f.comments, f.created_at
        FROM feedback f
        JOIN projects p ON p.id = f.project_id
        WHERE f.project_id = $1 AND p.student_id = $2
        ORDER BY f.created_at DESC
      `;
      values = [projectId, userId];
    } else if (userRole === 'supervisor') {
      query = `
        SELECT f.id, f.comments, f.created_at
        FROM feedback f
        JOIN projects p ON p.id = f.project_id
        WHERE f.project_id = $1 AND f.supervisor_id = $2
        ORDER BY f.created_at DESC
      `;
      values = [projectId, userId];
    } else {
      return res.status(403).json({ error: 'Unauthorized role' });
    }

    const result = await pool.query(query, values);

    if (result.rows.length === 0 && userRole === 'student') {
      // Check if project exists but has no feedback yet
      const projectCheck = await pool.query(
        'SELECT id FROM projects WHERE id = $1 AND student_id = $2',
        [projectId, userId]
      );
      if (projectCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Project not found or unauthorized' });
      }
    }

    const feedback = result.rows.map(row => ({
      id: row.id,
      comments: row.comments,
      created_at: row.created_at
    }));

    res.json(feedback);
  } catch (error) {
    console.error('Feedback retrieval error:', error);
    res.status(500).json({ error: 'Server error retrieving feedback' });
  }
});

module.exports = router;