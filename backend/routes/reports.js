const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const { createReport, getAllReports, getReport, getStats, updateVerification, findNearbyReports } = require('../models/Report');
const { broadcastNewReport } = require('../socket');

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = parseInt(process.env.UPLOAD_MAX_SIZE) || 10485760;
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: MAX_SIZE }, fileFilter: (req, file, cb) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Format file tidak didukung. Gunakan JPEG, PNG, atau WebP.'));
}});

router.post('/', (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Ukuran file maksimal 10MB.' });
      if (err.message) return res.status(400).json({ error: err.message });
      return res.status(500).json({ error: 'Gagal upload file.' });
    }
    if (!req.file) return res.status(400).json({ error: 'Foto wajib diupload.' });

    try {
      const lat = parseFloat(req.body.latitude);
      const lng = parseFloat(req.body.longitude);
      if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'Koordinat tidak valid.' });

      const nearby = findNearbyReports(lat, lng, 50);
      if (nearby.length > 0) {
        return res.status(409).json({
          error: 'Sudah ada laporan dalam radius 50m',
          nearby: nearby.map(r => ({ id: r.id, location_name: r.location_name, distance_m: r.distance_m }))
        });
      }

      const report = createReport({
        latitude: lat, longitude: lng,
        location_name: (req.body.location_name || '').trim().slice(0, 200),
        water_depth: Math.max(0, parseInt(req.body.water_depth) || 0),
        description: (req.body.description || '').trim().slice(0, 1000),
        imageUrl: '/uploads/' + req.file.filename,
        exifData: req.body.exif_data || null,
        photoTakenAt: req.body.photo_taken_at || null,
        gpsAccuracy: parseFloat(req.body.gps_accuracy) || 0,
        deviceInfo: req.body.device_info || null,
      });
      broadcastNewReport(report);
      res.status(201).json(report);
    } catch (e) {
      res.status(500).json({ error: 'Gagal menyimpan laporan.' });
    }
  });
});

router.get('/', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    res.json(getAllReports(page, limit));
  } catch (e) { res.status(500).json({ error: 'Gagal memuat laporan.' }); }
});

router.get('/stats', (req, res) => {
  try { res.json(getStats()); }
  catch (e) { res.status(500).json({ error: 'Gagal memuat statistik.' }); }
});

router.get('/nearby', (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = parseInt(req.query.radius) || 50;
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'Parameter lat dan lng diperlukan.' });
    res.json(findNearbyReports(lat, lng, radius));
  } catch (e) { res.status(500).json({ error: 'Gagal mencari laporan terdekat.' }); }
});

router.get('/:id', (req, res) => {
  try {
    const report = getReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Laporan tidak ditemukan.' });
    res.json(report);
  } catch (e) { res.status(500).json({ error: 'Gagal memuat laporan.' }); }
});

router.patch('/:id/verify', (req, res) => {
  try {
    const report = getReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Laporan tidak ditemukan.' });
    const verified = req.body.verified === true || req.body.verified === 1;
    res.json(updateVerification(req.params.id, verified));
  } catch (e) { res.status(500).json({ error: 'Gagal memperbarui laporan.' }); }
});

module.exports = router;
