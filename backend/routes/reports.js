const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const exifr = require('exifr');
const sharp = require('sharp');
const router = express.Router();
const {
  createReport, getAllReports, getReport, getStats,
  updateVerification, findNearbyReports, deleteReport
} = require('../models/Report');
const { broadcastNewReport, broadcastUpdate } = require('../socket');

// ─── Constants ───
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = parseInt(process.env.UPLOAD_MAX_SIZE, 10) || 10485760;
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || null;

const BBOX = {
  minLat: -5.65, maxLat: -5.35,
  minLng: 120.08, maxLng: 120.30,
};

// ─── Helpers ───

function validateCoord(v, min, max) {
  const n = parseFloat(v);
  return !isNaN(n) && isFinite(n) && n >= min && n <= max;
}

function isValidId(id) {
  const n = parseInt(id, 10);
  return !isNaN(n) && n >= 1 && Number.isSafeInteger(n);
}

/**
 * Auth middleware for admin endpoints.
 * Uses X-API-Key header or ?api_key query param.
 */
function requireAdmin(req, res, next) {
  if (!ADMIN_API_KEY) return next(); // No key set = open access (dev mode)
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (key === ADMIN_API_KEY) return next();
  return res.status(401).json({
    error: 'Unauthorized. Admin API key required.',
    hint: 'Set X-API-Key header or ?api_key= parameter.',
  });
}

// ─── Multer Config ───
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format file tidak didukung. Gunakan JPEG, PNG, atau WebP.'));
    }
  },
});

// ─── Routes ───

/**
 * POST /api/reports
 * Create a new flood report.
 */
router.post('/', (req, res, next) => {
  upload.single('photo')(req, res, async (uploadErr) => {
    if (uploadErr) {
      if (uploadErr.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Ukuran file maksimal 10MB.' });
      }
      if (uploadErr.message) {
        return res.status(400).json({ error: uploadErr.message });
      }
      return res.status(500).json({ error: 'Gagal upload file.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Foto wajib diupload. Ambil foto genangan banjir.' });
    }

    try {
      // Validate coordinates
      const lat = parseFloat(req.body.latitude);
      const lng = parseFloat(req.body.longitude);

      if (!validateCoord(lat, BBOX.minLat, BBOX.maxLat)) {
        // Clean up uploaded file
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({
          error: 'Koordinat latitude di luar wilayah Bulukumba.',
          hint: `Latitude harus antara ${BBOX.minLat} dan ${BBOX.maxLat}.`,
        });
      }
      if (!validateCoord(lng, BBOX.minLng, BBOX.maxLng)) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({
          error: 'Koordinat longitude di luar wilayah Bulukumba.',
          hint: `Longitude harus antara ${BBOX.minLng} dan ${BBOX.maxLng}.`,
        });
      }

      // Resize and optimize image
      const resizedPath = req.file.path.replace(/\.[^.]+$/, '') + '.jpg';
      try {
        await sharp(req.file.path)
          .resize(1280, 960, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toFile(resizedPath);
        if (resizedPath !== req.file.path) {
          fs.unlinkSync(req.file.path);
        }
      } catch (sharpErr) {
        console.error('[Sharp] Image processing failed:', sharpErr.message);
        // Use original file if resize fails
        return res.status(500).json({ error: 'Gagal memproses gambar. Coba upload foto lain.' });
      }

      // Extract EXIF on server side
      let exifData = null;
      let photoTakenAt = null;
      try {
        const exif = await exifr.parse(resizedPath, ['Make', 'Model', 'DateTimeOriginal']);
        if (exif) {
          exifData = JSON.stringify({ Make: exif.Make, Model: exif.Model });
          photoTakenAt = exif.DateTimeOriginal
            ? new Date(exif.DateTimeOriginal).toISOString()
            : null;
        }
      } catch {
        // EXIF extraction is best-effort
      }

      // Check for duplicate reports within 50m
      const nearby = findNearbyReports(lat, lng, 50);
      if (nearby.length > 0) {
        fs.unlink(resizedPath, () => {});
        return res.status(409).json({
          error: `Sudah ada ${nearby.length} laporan dalam radius 50m dari lokasi ini.`,
          nearby: nearby.map(r => ({
            id: r.id,
            location_name: r.location_name,
            distance_m: r.distance_m,
          })),
        });
      }

      // Validate depth
      const waterDepth = Math.max(0, Math.min(500, parseInt(req.body.water_depth, 10) || 0));

      // Create report
      const report = createReport({
        latitude: lat,
        longitude: lng,
        location_name: (req.body.location_name || '').trim().slice(0, 200),
        water_depth: waterDepth,
        description: (req.body.description || '').trim().slice(0, 1000),
        imageUrl: '/uploads/' + path.basename(resizedPath),
        exifData: req.body.exif_data || exifData,
        photoTakenAt: req.body.photo_taken_at || photoTakenAt,
        gpsAccuracy: parseFloat(req.body.gps_accuracy) || 0,
        deviceInfo: req.body.device_info || null,
      });

      broadcastNewReport(report);
      res.status(201).json({
        message: 'Laporan berhasil dikirim!',
        report,
      });
    } catch (err) {
      console.error('[POST /api/reports]', err.message);
      // Clean up on error
      if (req.file && req.file.path) {
        fs.unlink(req.file.path, () => {});
      }
      res.status(500).json({ error: 'Gagal menyimpan laporan. Silakan coba lagi.' });
    }
  });
});

/**
 * GET /api/reports
 * List reports with pagination.
 */
router.get('/', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const verified = req.query.verified;
    const minDepth = parseInt(req.query.min_depth, 10);
    const maxDepth = parseInt(req.query.max_depth, 10);
    const search = req.query.search ? req.query.search.trim() : '';

    const result = getAllReports(page, limit, {
      verified: verified !== undefined ? (verified === '1' || verified === 'true' ? 1 : 0) : undefined,
      minDepth: !isNaN(minDepth) ? minDepth : undefined,
      maxDepth: !isNaN(maxDepth) ? maxDepth : undefined,
      search: search || undefined,
    });

    res.json(result);
  } catch (err) {
    console.error('[GET /api/reports]', err.message);
    res.status(500).json({ error: 'Gagal memuat daftar laporan.' });
  }
});

/**
 * GET /api/reports/stats
 * Returns aggregate statistics.
 */
router.get('/stats', (req, res) => {
  try {
    const stats = getStats();
    res.json(stats);
  } catch (err) {
    console.error('[GET /api/reports/stats]', err.message);
    res.status(500).json({ error: 'Gagal memuat statistik.' });
  }
});

/**
 * GET /api/reports/nearby
 * Find reports near a coordinate.
 */
router.get('/nearby', (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = parseInt(req.query.radius, 10) || 50;

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'Parameter lat dan lng diperlukan.' });
    }

    const results = findNearbyReports(lat, lng, radius);
    res.json(results);
  } catch (err) {
    console.error('[GET /api/reports/nearby]', err.message);
    res.status(500).json({ error: 'Gagal mencari laporan terdekat.' });
  }
});

/**
 * GET /api/reports/bbox
 * Get reports within a bounding box (for efficient map rendering).
 */
router.get('/bbox', (req, res) => {
  try {
    const { south, west, north, east } = req.query;
    if (!south || !west || !north || !east) {
      return res.status(400).json({ error: 'Parameter south, west, north, east diperlukan.' });
    }
    const bbox = {
      south: parseFloat(south), west: parseFloat(west),
      north: parseFloat(north), east: parseFloat(east),
    };
    if ([bbox.south, bbox.west, bbox.north, bbox.east].some(isNaN)) {
      return res.status(400).json({ error: 'Parameter bounding box tidak valid.' });
    }
    const { getReportsInBBox } = require('../models/Report');
    const reports = getReportsInBBox(bbox);
    res.json(reports);
  } catch (err) {
    console.error('[GET /api/reports/bbox]', err.message);
    res.status(500).json({ error: 'Gagal memuat laporan dalam area.' });
  }
});

/**
 * GET /api/reports/:id
 * Get single report by ID.
 */
router.get('/:id', (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'ID laporan tidak valid.' });
    }
    const id = parseInt(req.params.id, 10);
    const report = getReport(id);
    if (!report) {
      return res.status(404).json({ error: 'Laporan tidak ditemukan.' });
    }
    res.json(report);
  } catch (err) {
    console.error('[GET /api/reports/:id]', err.message);
    res.status(500).json({ error: 'Gagal memuat laporan.' });
  }
});

/**
 * PATCH /api/reports/:id/verify
 * Verify/unverify a report (admin only).
 */
router.patch('/:id/verify', requireAdmin, (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'ID laporan tidak valid.' });
    }
    const id = parseInt(req.params.id, 10);
    const report = getReport(id);
    if (!report) {
      return res.status(404).json({ error: 'Laporan tidak ditemukan.' });
    }

    const verified = req.body.verified === true || req.body.verified === 'true' || req.body.verified === 1;
    const updated = updateVerification(id, verified);
    broadcastUpdate(updated);

    res.json({
      message: verified ? '✅ Laporan terverifikasi.' : '⏳ Verifikasi laporan dibatalkan.',
      report: updated,
    });
  } catch (err) {
    console.error('[PATCH /:id/verify]', err.message);
    res.status(500).json({ error: 'Gagal memperbarui verifikasi laporan.' });
  }
});

/**
 * DELETE /api/reports/:id
 * Delete a report (admin only).
 */
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'ID laporan tidak valid.' });
    }
    const id = parseInt(req.params.id, 10);
    const report = getReport(id);
    if (!report) {
      return res.status(404).json({ error: 'Laporan tidak ditemukan.' });
    }

    // Delete associated image
    if (report.image_url) {
      const imgPath = path.join(UPLOAD_DIR, path.basename(report.image_url));
      fs.unlink(imgPath, () => {});
    }

    deleteReport(id);
    res.json({ message: 'Laporan berhasil dihapus.', id });
  } catch (err) {
    console.error('[DELETE /:id]', err.message);
    res.status(500).json({ error: 'Gagal menghapus laporan.' });
  }
});

module.exports = router;
