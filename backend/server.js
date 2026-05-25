require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const reportsRouter = require('./routes/reports');
const weatherRouter = require('./routes/weather');
const { initDB } = require('./models/Report');
const { initSocket } = require('./socket');

const app = express();
const server = http.createServer(app);

// ─── Security ───
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

const corsOrigin = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'];
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// ─── Rate Limiting ───
// Skip rate limiting in test mode to allow supertest to run quickly
const isTest = process.env.NODE_ENV === 'test';
if (!isTest) {
  const globalLimiter = rateLimit({
    windowMs: 60000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Terlalu banyak request. Coba lagi dalam 1 menit.' },
  });
  app.use('/api/', globalLimiter);
}

const uploadLimiter = isTest
  ? (req, res, next) => next()
  : rateLimit({
    windowMs: 60000,
    max: 10,
    message: { error: 'Terlalu banyak upload. Coba lagi.' },
  });

// ─── Static Files ───
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

// ─── Health Check ───
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

// ─── API Routes ───
app.use('/api/reports', uploadLimiter, reportsRouter);
app.use('/api/weather', weatherRouter);

// ─── Error Handling Middleware ───
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.stack || err.message || err);

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request terlalu besar.' });
  }
  if (err.status === 413) {
    return res.status(413).json({ error: 'Ukuran file melebihi batas.' });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Terjadi kesalahan internal server.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ─── Serve Frontend Build ───
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend', 'build');
const FRONTEND_PUBLIC = path.join(__dirname, '..', 'frontend', 'public');

if (fs.existsSync(FRONTEND_DIR)) {
  app.use(express.static(FRONTEND_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  });
}

// In development, serve data from public dir
if (fs.existsSync(FRONTEND_PUBLIC)) {
  app.use('/data', express.static(path.join(FRONTEND_PUBLIC, 'data')));
} else if (fs.existsSync(path.join(FRONTEND_DIR, 'data'))) {
  app.use('/data', express.static(path.join(FRONTEND_DIR, 'data')));
}

// ─── Startup ───
const PORT = process.env.PORT || 4000;
initDB();
initSocket(server);

// Only start if not in test mode
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`🚀 Siaga Bulukumba backend running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    console.log(`   Upload dir: ${UPLOAD_DIR}`);
    console.log(`   DB: ${process.env.DB_PATH || path.join(__dirname, 'flood.db')}`);
    console.log(`   Admin API key: ${process.env.ADMIN_API_KEY ? '✅ Set' : '⚠️ Not set (verification endpoints open)'}`);
  });
}

// ─── Graceful Shutdown ───
function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  const { getIO } = require('./socket');
  try { getIO().close(); } catch {}
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
  // Force exit after 10s
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = { app, server };
