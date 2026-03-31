const path = require('path');
const fs = require('fs');

/**
 * Resolves the actual absolute file path from a stored file_url.
 */
const resolveFilePath = (fileUrl) => {
  if (!fileUrl) return null;

  // Strip all leading slashes and uploads/ prefix
  let relative = fileUrl
    .replace(/^\/+/, '')
    .replace(/^uploads\//, '');

  // Determine upload directory
  let uploadDir;
  if (process.env.UPLOAD_DIR) {
    uploadDir = path.resolve(process.env.UPLOAD_DIR);
  } else {
    uploadDir = path.resolve(process.cwd(), 'uploads');
  }

  const resolved = path.join(uploadDir, relative);

  // Debug log visible in Render logs
  console.log('[fileServe] debug:', {
    fileUrl,
    relative,
    uploadDir,
    resolved,
    cwd: process.cwd(),
    exists: fs.existsSync(resolved),
  });

  return resolved;
};

/**
 * List all files in uploads dir (for debugging).
 */
const listUploads = () => {
  try {
    const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
    if (!fs.existsSync(uploadDir)) {
      console.log('[fileServe] uploads dir missing:', uploadDir);
      return;
    }
    const allFiles = [];
    const walk = (dir) => {
      fs.readdirSync(dir).forEach(f => {
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) walk(full);
        else allFiles.push(full.replace(uploadDir, ''));
      });
    };
    walk(uploadDir);
    console.log('[fileServe] files on disk:', allFiles.length ? allFiles : '(empty)');
  } catch (e) {
    console.log('[fileServe] listUploads error:', e.message);
  }
};

/**
 * Serves a file for download or inline viewing.
 * disposition: 'attachment' (download) | 'inline' (view in browser)
 */
const serveFile = (res, fileUrl, fileName, disposition = 'attachment') => {
  if (!fileUrl) {
    return res.status(404).json({
      error: 'No file has been uploaded for this record yet.',
    });
  }

  listUploads();
  const filePath = resolveFilePath(fileUrl);

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({
      error: 'File not found on server.',
      looked_for: filePath,
      hint: 'Render restarted and wiped the file (ephemeral storage), or the file path in the database is wrong. Please re-upload the file via the admin panel.',
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
  res.removeHeader('X-Powered-By');

  const stream = fs.createReadStream(filePath);
  stream.on('error', (err) => {
    console.error('[fileServe] stream error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Error reading file' });
  });
  stream.pipe(res);
};

module.exports = { serveFile, resolveFilePath };