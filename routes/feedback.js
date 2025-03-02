const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const prisma = require('../prisma/client');
const config = require('../config/config');


const JWT_SECRET = config.jwt.secret;

const auth = (requiredRole) => {
  return async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (requiredRole && decoded.role !== requiredRole) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      req.user = { id: decoded.userId, role: decoded.role };
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
};

router.post('/feedback/:projectId', auth('supervisor'), async (req, res) => {
  const { projectId } = req.params;
  const { comments } = req.body;

  if (!comments) {
    return res.status(400).json({ error: 'Comments are required' });
  }

  try {
    const project = await prisma.project.findUnique({ where: { id: Number(projectId) } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await prisma.feedback.create({
      data: {
        projectId: Number(projectId),
        supervisorId: req.user.id,
        comments,
      },
    });

    res.status(201).json({ message: 'Feedback submitted' });
  } catch (error) {
    console.error('Feedback submission error:', error);
    res.status(500).json({ error: 'Server error submitting feedback' });
  }
});

router.get('/feedback/:projectId', auth(), async (req, res) => {
  const { projectId } = req.params;
  const { id: userId, role } = req.user;

  try {
    const whereClause = role === 'student'
      ? { id: Number(projectId), studentId: userId }
      : { id: Number(projectId), feedback: { some: { supervisorId: userId } } };

    const project = await prisma.project.findFirst({ 
      where: whereClause,
      select: { 
        title: true 
      },
    });

    if (!project && role === 'student') {
      return res.status(404).json({ error: 'Project not found or unauthorized' });
    }

    const feedback = await prisma.feedback.findMany({
      where: { projectId: Number(projectId) },
      orderBy: { createdAt: 'desc' },
      select: { id: true, comments: true, createdAt: true },
    });

    // Return both title and feedback in the response
    res.json({
      title: project ? project.title : 'Unknown Project', // Fallback if no project (e.g., supervisor with no feedback yet)
      feedback: feedback
    });
  } catch (error) {
    console.error('Feedback retrieval error:', error);
    res.status(500).json({ error: 'Server error retrieving feedback' });
  }
});

module.exports = router;