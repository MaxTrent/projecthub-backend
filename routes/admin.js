// routes/admin.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const config = require('../config/config');

const pool = new Pool(config.db);
const JWT_SECRET = config.jwt.secret;

// Authentication middleware for admin only
const auth = () => {
  return async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const userRole = decoded.role;

      if (userRole !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      req.user = { id: decoded.userId, role: userRole };
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
};

// Previous user management endpoints
router.get('/users', auth(), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, full_name, email, role FROM users ORDER BY id'
    );

    const users = result.rows.map(user => ({
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role
    }));

    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Server error fetching users' });
  }
});

router.post('/users', auth(), async (req, res) => {
  const { fullName, email, password, role } = req.body;

  if (!fullName || !email || !password || !role) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const validRoles = ['student', 'supervisor', 'admin'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    const emailCheck = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await pool.query(
      'INSERT INTO users (full_name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id',
      [fullName, email, hashedPassword, role]
    );

    const userId = result.rows[0].id;

    res.status(201).json({
      userId,
      message: 'User created'
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Server error creating user' });
  }
});

router.put('/users/:userId', auth(), async (req, res) => {
  const { userId } = req.params;
  const { fullName, email, role } = req.body;

  if (!fullName || !email || !role) {
    return res.status(400).json({ error: 'Full name, email, and role are required' });
  }

  const validRoles = ['student', 'supervisor', 'admin'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    const userCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [userId]
    );
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const emailCheck = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
      [email, userId]
    );
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Email already in use by another user' });
    }

    await pool.query(
      'UPDATE users SET full_name = $1, email = $2, role = $3 WHERE id = $4',
      [fullName, email, role, userId]
    );

    res.json({ message: 'User updated' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Server error updating user' });
  }
});

router.delete('/users/:userId', auth(), async (req, res) => {
  const { userId } = req.params;

  try {
    const userCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [userId]
    );
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Server error deleting user' });
  }
});

// NEW: Settings endpoints
// GET system settings
router.get('/settings', auth(), async (req, res) => {
  try {
    // Check if settings exist, initialize if not
    const check = await pool.query('SELECT COUNT(*) FROM settings');
    if (parseInt(check.rows[0].count) === 0) {
      await pool.query(
        'INSERT INTO settings (max_file_size, default_role) VALUES ($1, $2)',
        [50, 'student']
      );
    }

    const result = await pool.query(
      'SELECT max_file_size, default_role FROM settings LIMIT 1'
    );

    const settings = {
      maxFileSize: result.rows[0].max_file_size,
      defaultRole: result.rows[0].default_role
    };

    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Server error fetching settings' });
  }
});

// PUT update system settings
router.put('/settings', auth(), async (req, res) => {
  const { maxFileSize, defaultRole } = req.body;

  // Validate input
  if (!Number.isInteger(maxFileSize) || maxFileSize <= 0) {
    return res.status(400).json({ error: 'Valid maxFileSize (positive integer) required' });
  }

  const validRoles = ['student', 'supervisor', 'admin'];
  if (!validRoles.includes(defaultRole)) {
    return res.status(400).json({ error: 'Invalid defaultRole' });
  }

  try {
    // Ensure settings table has at least one row
    const check = await pool.query('SELECT COUNT(*) FROM settings');
    if (parseInt(check.rows[0].count) === 0) {
      await pool.query(
        'INSERT INTO settings (max_file_size, default_role) VALUES ($1, $2)',
        [50, 'student']
      );
    }

    // Update settings (assuming single row with id=1)
    await pool.query(
      'UPDATE settings SET max_file_size = $1, default_role = $2 WHERE id = 1',
      [maxFileSize, defaultRole]
    );

    res.json({ message: 'Settings updated' });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Server error updating settings' });
  }
});

module.exports = router;