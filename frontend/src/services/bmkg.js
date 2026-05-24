const cache = {};
const CACHE_TTL = 5 * 60 * 1000;

async function getCurrentWeather() {
  const now = Date.now();
  if (cache.current && now - cache.current.ts < CACHE_TTL) return cache.current.data;
  try {
    const res = await fetch('https://bmkg-restapi.vercel.app/v1/weather/73.02.02.1003/current');
    const data = await res.json();
    cache.current = { data: data.data, ts: now };
    return data.data;
  } catch { return null; }
}

async function getWeatherForecast() {
  const now = Date.now();
  if (cache.forecast && now - cache.forecast.ts < CACHE_TTL) return cache.forecast.data;
  try {
    const res = await fetch('https://bmkg-restapi.vercel.app/v1/weather/73.02.02.1003');
    const data = await res.json();
    cache.forecast = { data: data.data, ts: now };
    return data.data;
  } catch { return null; }
}

const weatherMap = { 0: 'Cerah', 1: 'Cerah Berawan', 2: 'Berawan', 3: 'Berawan Tebal', 4: 'Udara Kabur', 5: 'Asap', 10: 'Asap Tebal', 45: 'Berkabut', 60: 'Hujan Ringan', 61: 'Hujan Sedang', 63: 'Hujan Lebat', 80: 'Hujan Lokal', 95: 'Hujan Petir', 97: 'Hujan Petir Lebat' };

function weatherCodeToLabel(code) { return weatherMap[code] || 'Tidak diketahui'; }
function isRainyWeather(code) { return [60, 61, 63, 80, 95, 97].includes(code); }

export { getCurrentWeather, getWeatherForecast, weatherCodeToLabel, isRainyWeather };
