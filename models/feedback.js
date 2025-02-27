const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const prisma = require('../prisma/client'); // Import centralized Prisma client
const config = require('../config/config');

const JWT_SECRET = config.jwt.secret;

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
    const project = await prisma.project.findUnique({
      where: { id: Number(projectId) },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Insert feedback
    await prisma.feedback.create({
      data: {
        projectId: Number(projectId),
        supervisorId,
        comments,
      },
    });

    res.status(201).json({ message: 'Feedback submitted' });
  } catch (error) {
    console.error('Feedback submission error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// get feedback endpoint (student or supervisor)
router.get('/feedback/:projectId', auth(), async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.userId;
  const userRole = req.user.role;

  try {
    // Verify project exists and user has access
    let whereClause;
    if (userRole === 'student') {
      whereClause = { id: Number(projectId), studentId: userId };
    } else if (userRole === 'supervisor') {
      whereClause = {
        id: Number(projectId),
        OR: [
          { supervisorId: userId },
          { supervisorId: null },
        ],
      };
    } else {
      return res.status(403).json({ error: 'Unauthorized role' });
    }

    const project = await prisma.project.findFirst({
      where: whereClause,
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found or unauthorized' });
    }

    // Retrieve feedback
    const feedback = await prisma.feedback.findMany({
      where: { projectId: Number(projectId) },
      orderBy: { createdAt: 'desc' },
      select: { id: true, comments: true, createdAt: true },
    });

    res.json(feedback);
  } catch (error) {
    console.error('Feedback retrieval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

//error handling

router.use((err, req, res, next) => {
  console.error(err.stack);
  next(err);
});

module.exports = router;