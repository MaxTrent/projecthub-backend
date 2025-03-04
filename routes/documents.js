// const express = require('express');
// const router = express.Router();
// const jwt = require('jsonwebtoken');
// const prisma = require('../prisma/client');
// const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
// const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
// const config = require('../config/config');

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

// const auth = () => {
//   return async (req, res, next) => {
//     const token = req.headers.authorization?.split(' ')[1];
//     if (!token) return res.status(401).json({ error: 'No token provided' });

//     try {
//       const decoded = jwt.verify(token, JWT_SECRET);
//       const allowedRoles = ['student', 'supervisor', 'admin'];
//       if (!allowedRoles.includes(decoded.role)) {
//         return res.status(403).json({ error: 'Insufficient permissions' });
//       }
//       req.user = { id: decoded.userId, role: decoded.role };
//       next();
//     } catch (error) {
//       return res.status(401).json({ error: 'Invalid token' });
//     }
//   };
// };

// router.get('/:projectId', auth(), async (req, res) => {
//   const { projectId } = req.params;
//   const { id: userId, role } = req.user;

//   try {
//     const whereClause = role === 'student'
//       ? { id: Number(projectId), studentId: userId }
//       : role === 'supervisor'
//       ? { id: Number(projectId), supervisorId: userId }
//       : { id: Number(projectId) };

//     const project = await prisma.project.findFirst({
//       where: whereClause,
//       select: { fileKey: true, title: true },
//     });

//     if (!project || !project.fileKey) {
//       return res.status(404).json({ error: 'Project not found or unauthorized' });
//     }

//     // Generate a presigned URL for download
//     const command = new GetObjectCommand({
//       Bucket: BUCKET_NAME,
//       Key: project.fileKey
//     });
    
//     // URL expires in 1 hour
//     const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    
//     res.json({ 
//       downloadUrl, 
//       title: project.title,
//       expiresIn: '1 hour'
//     });
//   } catch (error) {
//     console.error('Document download error:', error);
//     res.status(500).json({ error: 'Server error generating download link' });
//   }
// });

// module.exports = router;


const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const prisma = require('../prisma/client');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');


const JWT_SECRET = config.jwt.secret;

const auth = () => {
  return async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const allowedRoles = ['student', 'supervisor', 'admin'];
      if (!allowedRoles.includes(decoded.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      req.user = { id: decoded.userId, role: decoded.role };
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
};

router.get('/:projectId', auth(), async (req, res) => {
  const { projectId } = req.params;
  const { id: userId, role } = req.user;

  try {
    const whereClause = role === 'student'
      ? { id: Number(projectId), studentId: userId }
      : role === 'supervisor'
      ? { id: Number(projectId), supervisorId: userId }
      : { id: Number(projectId) };

    const project = await prisma.project.findFirst({
      where: whereClause,
      select: { fileUrl: true },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found or unauthorized' });
    }

    const filePath = path.join(__dirname, '..', project.fileUrl);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Document file not found' });
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="project-${projectId}${ext}"`);

    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Document download error:', error);
    res.status(500).json({ error: 'Server error downloading document' });
  }
});

module.exports = router;