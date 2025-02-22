const express = require('express');
const multer = require('multer');
const auth = require('../middleware/auth');
const db = require('../config/db');
const router = express.Router();

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/', limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit

router.post('/upload', auth, upload.single('file'), async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Unauthorized' });

  const { title, abstract, keywords } = req.body;
  const filePath = req.file.path; // Placeholder; replace with cloud storage upload logic

  try {
    const result = await db.query(
      'INSERT INTO projects (title, abstract, keywords, student_id, file_url) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [title, abstract, keywords, req.user.id, filePath]
    );
    res.status(201).json({ projectId: result.rows[0].id, message: 'Project uploaded successfully' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;