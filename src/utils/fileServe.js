const path = require('path');
const fs = require('fs');

const isCloudinaryUrl = (url) => url && url.includes('cloudinary.com');

const serveFile = async (res, fileUrl, fileName, disposition = 'attachment') => {
  if (!fileUrl) {
    return res.status(404).json({
      error: 'No file has been uploaded for this record yet. Please upload via the admin panel.',
    });
  }

  const safeFileName = (fileName || path.basename(fileUrl)).replace(/[^\w.\-\s]/g, '_');

  // Cloudinary URL — redirect directly
  if (isCloudinaryUrl(fileUrl)) {
    let serveUrl = fileUrl;
    if (disposition === 'attachment') {
      // Force browser to download instead of preview
      serveUrl = fileUrl.replace('/upload/', `/upload/fl_attachment:${safeFileName.replace(/\s/g, '_')}/`);
    }
    return res.redirect(302, serveUrl);
  }

  // Local file fallback (for local dev)
  const relative = fileUrl.replace(/^\/+/, '').replace(/^uploads\//, '');
  const uploadDir = process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.resolve(process.cwd(), 'uploads');
  const filePath = path.join(uploadDir, relative);

  console.log('[fileServe] local path:', filePath, '| exists:', fs.existsSync(filePath));

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      error: 'File not found. It may have been lost on Render restart. Please re-upload via admin panel.',
    });
  }

  const ext = path.extname(fileName || fileUrl).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
  };

  res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeFileName}"`);
  res.setHeader('Cache-Control', 'no-store');

  const stream = fs.createReadStream(filePath);
  stream.on('error', (err) => {
    if (!res.headersSent) res.status(500).json({ error: 'Error reading file' });
  });
  stream.pipe(res);
};

module.exports = { serveFile };