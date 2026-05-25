const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const exifr = require('exifr');
const sharp = require('sharp');
const router = express.Router();
const { createReport, getAllReports, getReport, getStats, updateVerification, findNearbyReports } = require('../models/Report');
const { broadcastNewReport } = require('../socket');

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = parseInt(process.env.UPLOAD_MAX_SIZE, 10) || 10485760;
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || null;

const BBOX = { minLat: -5.65, maxLat: -5.35, minLng: 120.08, maxLng: 120.30 };

function validateCoord(v, min, max) {
  const n = parseFloat(v);
  return !isNaN(n) && n >= min && n <= max;
}

function authAdmin(req, res, next) {
  if (!ADMIN_API_KEY) return next();
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (key === ADMIN_API_KEY) return next();
  return res.status(401).json({ error: 'Unauthorized. Admin API key required.' });
}

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg')
});
const upload = multer({ storage, limits: { fileSize: MAX_SIZE }, fileFilter: (req, file, cb) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Format file tidak didukung. Gunakan JPEG, PNG, atau WebP.'));
}});

router.post('/', (req, res, next) => {
  upload.single('photo')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Ukuran file maksimal 10MB.' });
      if (err.message) return res.status(400).json({ error: err.message });
      return res.status(500).json({ error: 'Gagal upload file.' });
    }
    if (!req.file) return res.status(400).json({ error: 'Foto wajib diupload.' });

    try {
      const lat = parseFloat(req.body.latitude);
      const lng = parseFloat(req.body.longitude);
      if (!validateCoord(lat, BBOX.minLat, BBOX.maxLat) || !validateCoord(lng, BBOX.minLng, BBOX.maxLng)) {
        return res.status(400).json({ error: 'Koordinat di luar wilayah Bulukumba.' });
      }

      // Resize image
      const resizedPath = req.file.path.replace(/\.[^.]+$/, '') + '.jpg';
      await sharp(req.file.path)
        .resize(1280, 960, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(resizedPath);
      if (resizedPath !== req.file.path) fs.unlinkSync(req.file.path);

      // Extract EXIF on backend
      let exifData = null, photoTakenAt = null;
      try {
        const exif = await exifr.parse(resizedPath);
        if (exif) {
          exifData = JSON.stringify({ Make: exif.Make, Model: exif.Model });
          photoTakenAt = exif.DateTimeOriginal ? new Date(exif.DateTimeOriginal).toISOString() : null;
        }
      } catch {}

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
        water_depth: Math.max(0, parseInt(req.body.water_depth, 10) || 0),
        description: (req.body.description || '').trim().slice(0, 1000),
        imageUrl: '/uploads/' + path.basename(resizedPath),
        exifData: req.body.exif_data || exifData,
        photoTakenAt: req.body.photo_taken_at || photoTakenAt,
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
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
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
    const radius = parseInt(req.query.radius, 10) || 50;
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'Parameter lat dan lng diperlukan.' });
    res.json(findNearbyReports(lat, lng, radius));
  } catch (e) { res.status(500).json({ error: 'Gagal mencari laporan terdekat.' }); }
});

router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'ID tidak valid.' });
    const report = getReport(id);
    if (!report) return res.status(404).json({ error: 'Laporan tidak ditemukan.' });
    res.json(report);
  } catch (e) { res.status(500).json({ error: 'Gagal memuat laporan.' }); }
});

router.patch('/:id/verify', authAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'ID tidak valid.' });
    const report = getReport(id);
    if (!report) return res.status(404).json({ error: 'Laporan tidak ditemukan.' });
    const verified = req.body.verified === true || req.body.verified === 1;
    res.json(updateVerification(id, verified));
  } catch (e) { res.status(500).json({ error: 'Gagal memperbarui laporan.' }); }
});

module.exports = router;
