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

// GET all users
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

// POST create user
router.post('/users', auth(), async (req, res) => {
  const { fullName, email, password, role } = req.body;

  // Validate input
  if (!fullName || !email || !password || !role) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const validRoles = ['student', 'supervisor', 'admin'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    // Check for duplicate email
    const emailCheck = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert user
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

// PUT update user
router.put('/users/:userId', auth(), async (req, res) => {
  const { userId } = req.params;
  const { fullName, email, role } = req.body;

  // Validate input
  if (!fullName || !email || !role) {
    return res.status(400).json({ error: 'Full name, email, and role are required' });
  }

  const validRoles = ['student', 'supervisor', 'admin'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    // Check if user exists
    const userCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [userId]
    );
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check for email conflict (excluding current user)
    const emailCheck = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
      [email, userId]
    );
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Email already in use by another user' });
    }

    // Update user
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

// DELETE user
router.delete('/users/:userId', auth(), async (req, res) => {
  const { userId } = req.params;

  try {
    // Check if user exists
    const userCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [userId]
    );
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Server error deleting user' });
  }
});

module.exports = router;