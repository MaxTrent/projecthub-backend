// routes/documents.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

const pool = new Pool(config.db);
const JWT_SECRET = config.jwt.secret;

// Authentication middleware with role checking
const auth = () => {
  return async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const userId = decoded.userId;
      const userRole = decoded.role;

      // Allow student, supervisor, or admin
      if (!['student', 'supervisor', 'admin'].includes(userRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      req.user = { id: userId, role: userRole };
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
};

// Download project document endpoint
router.get('/:projectId', auth(), async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    // Query project details
    let query;
    let values;

    if (userRole === 'student') {
      query = 'SELECT file_url FROM projects WHERE id = $1 AND student_id = $2';
      values = [projectId, userId];
    } else if (userRole === 'supervisor') {
      query = 'SELECT file_url FROM projects WHERE id = $1 AND supervisor_id = $2';
      values = [projectId, userId];
    } else if (userRole === 'admin') {
      query = 'SELECT file_url FROM projects WHERE id = $1';
      values = [projectId];
    }

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found or unauthorized' });
    }

    const fileUrl = result.rows[0].file_url;
    const filePath = path.join(__dirname, '..', fileUrl); // Adjust path from /uploads/

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Document file not found' });
    }

    // Determine content type based on file extension
    const ext = path.extname(filePath).toLowerCase();
    let contentType;
    if (ext === '.pdf') {
      contentType = 'application/pdf';
    } else if (ext === '.doc') {
      contentType = 'application/msword';
    } else if (ext === '.docx') {
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    // Set response headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="project-${projectId}${ext}"`);

    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('File stream error:', error);
      res.status(500).json({ error: 'Error streaming file' });
    });

  } catch (error) {
    console.error('Document download error:', error);
    res.status(500).json({ error: 'Server error downloading document' });
  }
});

module.exports = router;