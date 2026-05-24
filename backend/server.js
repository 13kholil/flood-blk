require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const reportsRouter = require('./routes/reports');
const { initDB } = require('./models/Report');
const { initSocket } = require('./socket');

const app = express();
const server = http.createServer(app);

const corsOrigin = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'];
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));

const limiter = rateLimit({
  windowMs: 60000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak request. Coba lagi dalam 1 menit.' },
});
app.use('/api/', limiter);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const uploadLimiter = rateLimit({ windowMs: 60000, max: 10, message: { error: 'Terlalu banyak upload. Coba lagi.' } });
app.use('/api/reports', uploadLimiter, reportsRouter);

const PORT = process.env.PORT || 4000;

initDB();
initSocket(server);
server.listen(PORT, () => console.log(`Backend running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`));
