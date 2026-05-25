require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const reportsRouter = require('./routes/reports');
const { initDB } = require('./models/Report');
const { initSocket } = require('./socket');

const app = express();
const server = http.createServer(app);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));

const corsOrigin = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'];
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));

const limiter = rateLimit({
  windowMs: 60000, max: 60, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Terlalu banyak request. Coba lagi dalam 1 menit.' },
});
app.use('/api/', limiter);

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

// Serve frontend build + data in production
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend', 'build');
const FRONTEND_PUBLIC = path.join(__dirname, '..', 'frontend', 'public');
if (fs.existsSync(FRONTEND_DIR)) {
  app.use(express.static(FRONTEND_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  });
}
// In development, serve data from public dir
if (fs.existsSync(FRONTEND_PUBLIC)) {
  app.use('/data', express.static(path.join(FRONTEND_PUBLIC, 'data')));
} else if (fs.existsSync(path.join(FRONTEND_DIR, 'data'))) {
  app.use('/data', express.static(path.join(FRONTEND_DIR, 'data')));
}

const uploadLimiter = rateLimit({ windowMs: 60000, max: 10, message: { error: 'Terlalu banyak upload. Coba lagi.' } });
app.use('/api/reports', uploadLimiter, reportsRouter);

const PORT = process.env.PORT || 4000;
initDB();
initSocket(server);
server.listen(PORT, () => console.log(`Backend running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`));

function shutdown() {
  console.log('Shutting down gracefully...');
  const { getIO } = require('./socket');
  try { getIO().close(); } catch {}
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
