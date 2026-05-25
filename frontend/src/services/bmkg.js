import { BMKG_STATION_CODE, BMKG_API_BASE } from '../constants';

const cache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:4000';

/**
 * Get current weather from backend proxy (with server-side caching).
 * Falls back to direct BMKG API if backend is unavailable.
 */
async function getCurrentWeather() {
  const now = Date.now();
  if (cache.current && now - cache.current.ts < CACHE_TTL) {
    return cache.current.data;
  }

  // Try backend proxy first
  try {
    const res = await fetch(`${API_BASE}/api/weather/current`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.temperature_c !== undefined) {
        cache.current = { data, ts: now };
        return data;
      }
    }
  } catch {
    console.warn('[BMKG] Backend proxy unavailable, trying direct...');
  }

  // Fallback: direct BMKG API
  try {
    const res = await fetch(`${BMKG_API_BASE}/${BMKG_STATION_CODE}/current`);
    const json = await res.json();
    if (!json || !json.data) return null;

    const data = json.data;
    const result = {
      temperature_c: data.temperature_c,
      humidity_pct: data.humidity_pct,
      wind_speed_kmh: data.wind_speed_kmh,
      pressure_mb: data.pressure_mb,
      weather_code: data.weather_code,
      description: data.description || weatherCodeToLabel(data.weather_code),
      timestamp: data.datetime || new Date().toISOString(),
    };

    cache.current = { data: result, ts: now };
    return result;
  } catch {
    return null;
  }
}

/**
 * Get weather forecast from backend proxy.
 */
async function getWeatherForecast() {
  const now = Date.now();
  if (cache.forecast && now - cache.forecast.ts < CACHE_TTL) {
    return cache.forecast.data;
  }

  try {
    const res = await fetch(`${API_BASE}/api/weather/forecast`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.data) {
        cache.forecast = { data: data.data, ts: now };
        return data.data;
      }
    }
  } catch {
    console.warn('[BMKG] Forecast proxy unavailable.');
  }

  return null;
}

const weatherMap = {
  0: 'Cerah', 1: 'Cerah Berawan', 2: 'Berawan', 3: 'Berawan Tebal',
  4: 'Udara Kabur', 5: 'Asap', 10: 'Asap Tebal', 45: 'Berkabut',
  60: 'Hujan Ringan', 61: 'Hujan Sedang', 63: 'Hujan Lebat',
  80: 'Hujan Lokal', 85: 'Hujan Salju', 86: 'Hujan Salju Lebat',
  95: 'Hujan Petir', 96: 'Hujan Petir Lebat', 97: 'Hujan Petir Lebat',
};

function weatherCodeToLabel(code) {
  return weatherMap[code] || 'Tidak diketahui';
}

function isRainyWeather(code) {
  return [60, 61, 63, 80, 95, 96, 97].includes(code);
}

export { getCurrentWeather, getWeatherForecast, weatherCodeToLabel, isRainyWeather };
