const path = require('path');
const fs = require('fs');

/**
 * Resolves the actual file path from a stored file_url.
 * Handles both /uploads/... and relative paths.
 */
const resolveFilePath = (fileUrl) => {
  if (!fileUrl) return null;

  // Strip leading slash and /uploads/ prefix variations
  let relative = fileUrl
    .replace(/^\/uploads\//, '')
    .replace(/^uploads\//, '');

  const uploadDir = process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.resolve(__dirname, '../../uploads');

  return path.join(uploadDir, relative);
};

/**
 * Serves a file for download or inline viewing.
 * @param {object} res - Express response
 * @param {string} fileUrl - stored file_url from DB
 * @param {string} fileName - original file name
 * @param {string} disposition - 'attachment' (download) or 'inline' (view in browser)
 */
const serveFile = (res, fileUrl, fileName, disposition = 'attachment') => {
  const filePath = resolveFilePath(fileUrl);

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({
      error: 'File not found on server. It may have been removed or not yet uploaded.',
    });
  }

  const ext = path.extname(fileName || fileUrl).toLowerCase();
  const mimeTypes = {
    '.pdf':  'application/pdf',
    '.doc':  'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls':  'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt':  'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';
  const safeFileName = (fileName || path.basename(fileUrl)).replace(/[^\w.\-\s]/g, '_');

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeFileName}"`);
  res.setHeader('Cache-Control', 'no-store');
  // Hide backend internals
  res.setHeader('X-Powered-By', 'UNAIDS Platform');

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => res.status(500).json({ error: 'Error reading file' }));
  stream.pipe(res);
};

module.exports = { serveFile, resolveFilePath };