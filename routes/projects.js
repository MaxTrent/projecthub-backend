// const express = require('express');
// const router = express.Router();
// const multer = require('multer');
// const path = require('path');
// const jwt = require('jsonwebtoken');
// const prisma = require('../prisma/client');
// const config = require('../config/config');
// const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
// const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// const JWT_SECRET = config.jwt.secret;

// // Configure AWS S3
// const s3Client = new S3Client({
//   region: config.aws.region || 'us-east-1',
//   credentials: {
//     accessKeyId: config.aws.accessKeyId,
//     secretAccessKey: config.aws.secretAccessKey
//   }
// });

// const BUCKET_NAME = config.aws.bucketName || 'your-bucket-name';

// // Configure multer 
// const storage = multer.memoryStorage();

// const fileFilter = (req, file, cb) => {
//   const allowedTypes = [
//     'application/pdf',
//     'application/msword',
//     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
//   ];
//   cb(null, allowedTypes.includes(file.mimetype));
// };

// const getUploadMiddleware = async () => {
//   const settings = await prisma.setting.findFirst();
//   const maxSize = (settings?.maxFileSize || 50) * 1024 * 1024;

//   return multer({
//     storage,
//     limits: { fileSize: maxSize },
//     fileFilter,
//   });
// };

// const auth = (requiredRole) => {
//   return async (req, res, next) => {
//     const token = req.headers.authorization?.split(' ')[1];
//     if (!token) return res.status(401).json({ error: 'No token provided' });

//     try {
//       const decoded = jwt.verify(token, JWT_SECRET);
//       if (requiredRole && decoded.role !== requiredRole) {
//         return res.status(403).json({ error: 'Insufficient permissions' });
//       }
//       req.user = { id: decoded.userId, role: decoded.role };
//       next();
//     } catch (error) {
//       return res.status(401).json({ error: 'Invalid token' });
//     }
//   };
// };

// // Helper function to upload file to S3
// const uploadFileToS3 = async (file, key) => {
//   const params = {
//     Bucket: BUCKET_NAME,
//     Key: key,
//     Body: file.buffer,
//     ContentType: file.mimetype
//   };

//   await s3Client.send(new PutObjectCommand(params));
//   return `s3://${BUCKET_NAME}/${key}`;
// };

// // Helper function to generate a presigned URL for file download
// const getFileDownloadUrl = async (fileKey) => {
//   const command = new GetObjectCommand({
//     Bucket: BUCKET_NAME,
//     Key: fileKey
//   });
  
//   // URL expires in 1 hour
//   return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
// };

// router.post('/upload', auth('student'), async (req, res, next) => {
//   const uploadMiddleware = await getUploadMiddleware();
//   uploadMiddleware.single('file')(req, res, async (err) => {
//     if (err) {
//       return next(err);
//     }
    
//     const { title, abstract, keywords } = req.body;
//     const file = req.file;

//     if (!title || !abstract || !keywords || !file) {
//       return res.status(400).json({ error: 'All fields and file are required' });
//     }

//     try {
//       const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//       const fileKey = `projects/${req.user.id}/${uniqueSuffix}${path.extname(file.originalname)}`;
      
//       // Upload to S3 
//       const s3Url = await uploadFileToS3(file, fileKey);
      
//       const project = await prisma.project.create({
//         data: {
//           title,
//           abstract,
//           keywords,
//           studentId: req.user.id,
//           status: 'draft',
//           fileUrl: s3Url,
//           fileKey: fileKey, // Store the S3 key for future reference
//         },
//       });

//       res.status(201).json({ projectId: project.id, message: 'Project uploaded successfully' });
//     } catch (error) {
//       console.error('Project upload error:', error);
//       res.status(500).json({ error: 'Server error during project upload' });
//     }
//   });
// });

// router.get('/download/:projectId', auth('student'), async (req, res) => {
//   const { projectId } = req.params;

//   try {
//     const project = await prisma.project.findFirst({
//       where: { 
//         id: Number(projectId),
//         OR: [
//           { studentId: req.user.id },
//           { status: 'approved' } // Public access for approved projects
//         ]
//       },
//       select: { fileKey: true, title: true }
//     });

//     if (!project || !project.fileKey) {
//       return res.status(404).json({ error: 'Project not found or unauthorized' });
//     }

//     // Generate a presigned URL for download
//     const downloadUrl = await getFileDownloadUrl(project.fileKey);
    
//     // Redirect to presigned URL or return it
//     res.json({ downloadUrl, title: project.title });
//   } catch (error) {
//     console.error('Download error:', error);
//     res.status(500).json({ error: 'Server error generating download link' });
//   }
// });

// router.get('/status/:projectId', auth('student'), async (req, res) => {
//   const { projectId } = req.params;

//   try {
//     const project = await prisma.project.findFirst({
//       where: { id: Number(projectId), studentId: req.user.id },
//       select: { title: true, status: true },
//     });

//     if (!project) {
//       return res.status(404).json({ error: 'Project not found or unauthorized' });
//     }

//     const updates = await prisma.statusUpdate.findMany({
//       where: { projectId: Number(projectId) },
//       orderBy: { updatedAt: 'desc' },
//       select: { status: true, comments: true, updatedAt: true },
//     });

//     res.json({
//       title: project.title,
//       status: project.status,
//       updates: updates.map(u => ({
//         date: u.updatedAt,
//         status: u.status,
//         comments: u.comments || '',
//       })),
//     });
//   } catch (error) {
//     console.error('Status fetch error:', error);
//     res.status(500).json({ error: 'Server error fetching project status' });
//   }
// });

// router.post('/status/:projectId', auth('supervisor'), async (req, res) => {
//   const { projectId } = req.params;
//   const { status, comments } = req.body;

//   const validStatuses = ['draft', 'submitted', 'under_review', 'approved'];
//   if (!status || !validStatuses.includes(status)) {
//     return res.status(400).json({ error: 'Valid status is required' });
//   }

//   try {
//     const project = await prisma.project.findUnique({ where: { id: Number(projectId) } });
//     if (!project) {
//       return res.status(404).json({ error: 'Project not found' });
//     }

//     await prisma.$transaction([
//       prisma.statusUpdate.create({
//         data: { projectId: Number(projectId), status, comments },
//       }),
//       prisma.project.update({
//         where: { id: Number(projectId) },
//         data: { status },
//       }),
//     ]);

//     res.status(200).json({ message: 'Project status updated successfully' });
//   } catch (error) {
//     console.error('Status update error:', error);
//     res.status(500).json({ error: 'Server error updating project status' });
//   }
// });

// router.get('/search', async (req, res) => {
//   const { keyword, page = 1 } = req.query;
//   const limit = 10;
//   const skip = (page - 1) * limit;

//   if (!keyword) {
//     return res.status(400).json({ error: 'Keyword parameter is required' });
//   }

//   try {
//     const projects = await prisma.project.findMany({
//       where: {
//         keywords: { search: keyword.split(' ').join(' & ') },
//       },
//       include: { student: { select: { fullName: true } } },
//       orderBy: { _relevance: { fields: ['keywords'], search: keyword, sort: 'desc' } },
//       take: limit,
//       skip,
//     });

//     const results = projects.map(p => ({
//       projectId: p.id,
//       title: p.title,
//       author: p.student.fullName,
//       year: p.createdAt.getFullYear(),
//       keywords: p.keywords,
//     }));

//     res.json(results);
//   } catch (error) {
//     console.error('Search error:', error);
//     res.status(500).json({ error: 'Server error during search' });
//   }
// });

// router.use((error, req, res, next) => {
//   if (error instanceof multer.MulterError) {
//     const message = error.code === 'LIMIT_FILE_SIZE' 
//       ? 'File size exceeds limit' 
//       : error.message;
//     return res.status(400).json({ error: message });
//   } else if (error) {
//     return res.status(400).json({ error: error.message });
//   }
//   next();
// });

// module.exports = router;



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
        OR: [
          { title: { contains: keyword, mode: 'insensitive' } },
          { keywords: { contains: keyword, mode: 'insensitive' } },
          { student: { fullName: { contains: keyword, mode: 'insensitive' } } },
          // Search by year (convert keyword to number if applicable)
          { createdAt: { gte: new Date(`${keyword}-01-01`), lte: new Date(`${keyword}-12-31`) } },
        ],
      },
      include: {
        student: { select: { fullName: true } },
      },
      orderBy: {
        createdAt: 'desc',
      },
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

    console.log('Search results sent:', results); // Debug log
    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Server error during search' });
  }
});

router.get('/:projectId', auth(), async (req, res) => {
  const { projectId } = req.params;
  const { id: userId, role } = req.user;

  try {
    const whereClause = role === 'student'
      ? { id: Number(projectId), studentId: userId }
      : { id: Number(projectId) }; // Supervisors can view any project

    const project = await prisma.project.findFirst({
      where: whereClause,
      include: { student: { select: { fullName: true } } },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found or unauthorized' });
    }

    res.json({
      projectId: project.id,
      title: project.title,
      author: project.student.fullName,
      year: project.createdAt.getFullYear(),
      keywords: project.keywords,
      abstract: project.abstract,
      fileUrl: project.fileUrl,
    });
  } catch (error) {
    console.error('Error fetching project details:', error);
    res.status(500).json({ error: 'Server error fetching project details' });
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