const express = require('express');
const router = express.Router();

const BMKG_API_BASE = process.env.BMKG_API_BASE || 'https://bmkg-restapi.vercel.app/v1/weather';
const BMKG_STATION = process.env.BMKG_STATION_CODE || '73.02.02.1003';

// ─── In-memory cache ───
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch BMKG data with caching.
 * @param {string} endpoint - e.g. /current or /
 * @returns {Promise<object>}
 */
async function fetchBMKG(endpoint) {
  const cacheKey = endpoint;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  const url = `${BMKG_API_BASE}/${BMKG_STATION}${endpoint}`;
  console.log(`[BMKG] Fetching: ${url}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`BMKG API returned ${res.status}`);
    }
    const data = await res.json();

    // Cache it
    cache.set(cacheKey, { data, ts: Date.now() });
    return data;
  } catch (err) {
    // Return stale cache if available
    if (cached) {
      console.log(`[BMKG] Using stale cache for ${endpoint}`);
      return cached.data;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * GET /api/weather/current
 * Returns current weather for Bulukumba.
 */
router.get('/current', async (_req, res) => {
  try {
    const data = await fetchBMKG('/current');
    if (!data || !data.data) {
      return res.status(502).json({
        error: 'Gagal memuat data cuaca dari BMKG.',
        data: null,
      });
    }
    const w = data.data;
    res.json({
      temperature_c: w.temperature_c,
      humidity_pct: w.humidity_pct,
      wind_speed_kmh: w.wind_speed_kmh,
      pressure_mb: w.pressure_mb,
      weather_code: w.weather_code,
      description: w.description || weatherCodeToLabel(w.weather_code),
      timestamp: w.datetime || new Date().toISOString(),
    });
  } catch (err) {
    console.error('[BMKG] Error fetching current weather:', err.message);
    res.status(502).json({
      error: 'Gagal terhubung ke layanan cuaca BMKG.',
      data: null,
    });
  }
});

/**
 * GET /api/weather/forecast
 * Returns 3-day weather forecast.
 */
router.get('/forecast', async (_req, res) => {
  try {
    const data = await fetchBMKG('');
    if (!data || !data.data) {
      return res.status(502).json({
        error: 'Gagal memuat prakiraan cuaca dari BMKG.',
        data: null,
      });
    }
    res.json({ data: data.data, source: 'BMKG' });
  } catch (err) {
    console.error('[BMKG] Error fetching forecast:', err.message);
    res.status(502).json({
      error: 'Gagal terhubung ke layanan cuaca BMKG.',
      data: null,
    });
  }
});

/**
 * GET /api/weather/station
 * Returns station info.
 */
router.get('/station', (_req, res) => {
  res.json({
    station_code: BMKG_STATION,
    location: 'Kel. Terang-Terang, Kec. Ujung Bulu, Bulukumba, Sulawesi Selatan',
    api_base: BMKG_API_BASE,
  });
});

function weatherCodeToLabel(code) {
  const map = {
    0: 'Cerah', 1: 'Cerah Berawan', 2: 'Berawan', 3: 'Berawan Tebal',
    4: 'Udara Kabur', 5: 'Asap', 10: 'Asap Tebal', 45: 'Berkabut',
    60: 'Hujan Ringan', 61: 'Hujan Sedang', 63: 'Hujan Lebat',
    80: 'Hujan Lokal', 85: 'Hujan Salju', 86: 'Hujan Salju Lebat',
    95: 'Hujan Petir', 96: 'Hujan Petir Lebat', 97: 'Hujan Petir Lebat',
  };
  return map[code] || 'Tidak diketahui';
}

module.exports = router;
