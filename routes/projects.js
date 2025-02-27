const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma/client');
const config = require('../config/config');


const JWT_SECRET = config.jwt.secret;

const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const getUploadMiddleware = async () => {
    const settings = await prisma.setting.findFirst();
    const maxSize = (settings?.maxFileSize || 50) * 1024 * 1024;
  
    return multer({
      storage,
      limits: { fileSize: maxSize },
      fileFilter,
    });
  };

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  cb(null, allowedTypes.includes(file.mimetype));
};

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter,
});

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

router.post('/upload', auth('student'), async (req, res, next) => {
    const uploadMiddleware = await getUploadMiddleware();
    uploadMiddleware.single('file')(req, res, next);
  }, async (req, res) => {
  const { title, abstract, keywords } = req.body;
  const file = req.file;

  if (!title || !abstract || !keywords || !file) {
    return res.status(400).json({ error: 'All fields and file are required' });
  }

  try {
    const fileUrl = `/uploads/${file.filename}`;
    const project = await prisma.project.create({
      data: {
        title,
        abstract,
        keywords,
        studentId: req.user.id,
        status: 'draft',
        fileUrl,
      },
    });

    res.status(201).json({ projectId: project.id, message: 'Project uploaded successfully' });
  } catch (error) {
    console.error('Project upload error:', error);
    res.status(500).json({ error: 'Server error during project upload' });
  }
});

router.get('/status/:projectId', auth('student'), async (req, res) => {
  const { projectId } = req.params;

  try {
    const project = await prisma.project.findFirst({
      where: { id: Number(projectId), studentId: req.user.id },
      select: { title: true, status: true },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found or unauthorized' });
    }

    const updates = await prisma.statusUpdate.findMany({
      where: { projectId: Number(projectId) },
      orderBy: { updatedAt: 'desc' },
      select: { status: true, comments: true, updatedAt: true },
    });

    res.json({
      title: project.title,
      status: project.status,
      updates: updates.map(u => ({
        date: u.updatedAt,
        status: u.status,
        comments: u.comments || '',
      })),
    });
  } catch (error) {
    console.error('Status fetch error:', error);
    res.status(500).json({ error: 'Server error fetching project status' });
  }
});

router.post('/status/:projectId', auth('supervisor'), async (req, res) => {
  const { projectId } = req.params;
  const { status, comments } = req.body;

  const validStatuses = ['draft', 'submitted', 'under_review', 'approved'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Valid status is required' });
  }

  try {
    const project = await prisma.project.findUnique({ where: { id: Number(projectId) } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await prisma.$transaction([
      prisma.statusUpdate.create({
        data: { projectId: Number(projectId), status, comments },
      }),
      prisma.project.update({
        where: { id: Number(projectId) },
        data: { status },
      }),
    ]);

    res.status(200).json({ message: 'Project status updated successfully' });
  } catch (error) {
    console.error('Status update error:', error);
    res.status(500).json({ error: 'Server error updating project status' });
  }
});

router.get('/search', async (req, res) => {
  const { keyword, page = 1 } = req.query;
  const limit = 10;
  const skip = (page - 1) * limit;

  if (!keyword) {
    return res.status(400).json({ error: 'Keyword parameter is required' });
  }

  try {
    const projects = await prisma.project.findMany({
      where: {
        keywords: { search: keyword.split(' ').join(' & ') },
      },
      include: { student: { select: { fullName: true } } },
      orderBy: { _relevance: { fields: ['keywords'], search: keyword, sort: 'desc' } },
      take: limit,
      skip,
    });

    const results = projects.map(p => ({
      projectId: p.id,
      title: p.title,
      author: p.student.fullName,
      year: p.createdAt.getFullYear(),
      keywords: p.keywords,
    }));

    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Server error during search' });
  }
});

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'File size exceeds 50MB limit' : error.message });
  } else if (error) {
    return res.status(400).json({ error: error.message });
  }
  next();
});

module.exports = router;