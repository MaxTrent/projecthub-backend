const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const config = require('../config/config'); // Centralized config

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = config.jwt.secret;
const JWT_EXPIRY = config.jwt.expiresIn;

const validRoles = ['student', 'supervisor', 'admin'];

//function for sending consistent errors
const errorResponse = (res, status, message) => res.status(status).json({ error: message });

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

module.exports = router;