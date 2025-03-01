const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const config = require('../config/config'); // Centralized config

const router = express.Router();
const prisma = require('../prisma/client')
const JWT_SECRET = config.jwt.secret;
const JWT_EXPIRY = config.jwt.expiresIn;

const validRoles = ['student', 'supervisor', 'admin'];

//function for sending errors
const errorResponse = (res, status, message) => res.status(status).json({ error: message });

const auth = (requiredRole) => {
  return async (req, res, next) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        return errorResponse(res, 401, 'No token provided');
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      if (requiredRole && decoded.role !== requiredRole) {
        return errorResponse(res, 403, 'Unauthorized: Invalid role');
      }

      req.user = decoded;
      next();
    } catch (error) {
      return errorResponse(res, 401, 'Invalid token');
    }
  };
};

// Register route
router.post('/register', async (req, res) => {
  try {
    let { email, password, fullName, role } = req.body;

    if (!email || !password || !fullName || !role) {
      return errorResponse(res, 400, 'All fields are required');
    }

    email = email.trim().toLowerCase();
    fullName = fullName.trim();
    role = role.trim().toLowerCase();

    if (!validRoles.includes(role)) {
      return errorResponse(res, 400, 'Invalid role');
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return errorResponse(res, 400, 'Email already registered');
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { fullName, email, password: hashedPassword, role },
    });

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

    res.status(201).json({ userId: user.id, token, role: user.role });
  } catch (error) {
    console.error('Registration error:', error);
    errorResponse(res, 500, 'Registration failed');
  }
});

// Login route
router.post('/login', async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return errorResponse(res, 400, 'Email and password are required');
    }

    email = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return errorResponse(res, 401, 'Invalid credentials');
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

    res.json({ userId: user.id, token, role: user.role });
  } catch (error) {
    console.error('Login error:', error);
    errorResponse(res, 500, 'Login failed');
  }
});

router.get('/currentUser', auth(), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user details:', error);
    errorResponse(res, 500, 'Failed to fetch user details');
  }
});

module.exports = router;