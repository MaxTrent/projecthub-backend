const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const config = require('../config/config');

const prisma = new PrismaClient();
const JWT_SECRET = config.jwt.secret;

const auth = () => {
  return async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      req.user = { id: decoded.userId, role: decoded.role };
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
};

router.get('/users', auth(), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, fullName: true, email: true, role: true },
    });
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
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: { fullName, email, password: hashedPassword, role },
    });

    res.status(201).json({ userId: user.id, message: 'User created' });
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
    const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const emailConflict = await prisma.user.findFirst({
      where: { email, id: { not: Number(userId) } },
    });
    if (emailConflict) {
      return res.status(400).json({ error: 'Email already in use by another user' });
    }

    await prisma.user.update({
      where: { id: Number(userId) },
      data: { fullName, email, role },
    });

    res.json({ message: 'User updated' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Server error updating user' });
  }
});

router.delete('/users/:userId', auth(), async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await prisma.user.delete({ where: { id: Number(userId) } });
    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Server error deleting user' });
  }
});

router.get('/settings', auth(), async (req, res) => {
  try {
    let settings = await prisma.setting.findFirst();
    if (!settings) {
      settings = await prisma.setting.create({
        data: { maxFileSize: 50, defaultRole: 'student' },
      });
    }
    res.json({ maxFileSize: settings.maxFileSize, defaultRole: settings.defaultRole });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Server error fetching settings' });
  }
});

router.put('/settings', auth(), async (req, res) => {
  const { maxFileSize, defaultRole } = req.body;

  if (!Number.isInteger(maxFileSize) || maxFileSize <= 0) {
    return res.status(400).json({ error: 'Valid maxFileSize (positive integer) required' });
  }

  const validRoles = ['student', 'supervisor', 'admin'];
  if (!validRoles.includes(defaultRole)) {
    return res.status(400).json({ error: 'Invalid defaultRole' });
  }

  try {
    let settings = await prisma.setting.findFirst();
    if (!settings) {
      settings = await prisma.setting.create({
        data: { maxFileSize: 50, defaultRole: 'student' },
      });
    }

    await prisma.setting.update({
      where: { id: settings.id },
      data: { maxFileSize, defaultRole },
    });

    res.json({ message: 'Settings updated' });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Server error updating settings' });
  }
});

module.exports = router;