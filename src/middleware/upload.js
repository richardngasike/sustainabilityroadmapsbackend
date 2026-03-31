const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

// Determine Cloudinary folder based on request path
const getFolder = (req) => {
  if (req.path.includes('countr') || req.baseUrl.includes('countr')) return 'unaids/profiles';
  if (req.path.includes('roadmap') || req.baseUrl.includes('roadmap')) return 'unaids/roadmaps';
  if (req.path.includes('news') || req.baseUrl.includes('news')) return 'unaids/news';
  return 'unaids/documents';
};

// Cloudinary storage for documents/PDFs
const documentStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const folder = getFolder(req);
    const isImage = file.mimetype.startsWith('image/');
    return {
      folder,
      resource_type: isImage ? 'image' : 'raw',  // 'raw' for PDFs/docs
      use_filename: true,
      unique_filename: true,
      // Keep original extension
      format: undefined,
    };
  },
});

// Cloudinary storage for images (thumbnails, covers)
const imageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'unaids/images',
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    transformation: [{ width: 1200, crop: 'limit', quality: 'auto' }],
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`), false);
  }
};

// Main upload instance — handles both docs and images
// Uses documentStorage for everything; images get uploaded correctly via resource_type logic
const upload = multer({
  storage: documentStorage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

module.exports = upload;