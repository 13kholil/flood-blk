export const DEPTH_THRESHOLDS = [
  { max: 0, label: 'Tidak ada data', color: '#cccccc', textColor: '#666' },
  { max: 20, label: 'Rendah', color: '#ccf2ff', textColor: '#003366' },
  { max: 50, label: 'Sedang', color: '#66ccff', textColor: '#003366' },
  { max: 100, label: 'Tinggi', color: '#0066cc', textColor: 'white' },
  { max: Infinity, label: 'Bahaya', color: '#003366', textColor: 'white' },
];

export function getDepthColor(d) {
  if (!d || d < 0) return DEPTH_THRESHOLDS[0].color;
  for (const t of DEPTH_THRESHOLDS) {
    if (d <= t.max) return t.color;
  }
  return DEPTH_THRESHOLDS[DEPTH_THRESHOLDS.length - 1].color;
}

export function getDepthLabel(d) {
  if (!d || d < 0) return DEPTH_THRESHOLDS[0].label;
  for (const t of DEPTH_THRESHOLDS) {
    if (d <= t.max) return t.label;
  }
  return DEPTH_THRESHOLDS[DEPTH_THRESHOLDS.length - 1].label;
}

export function getDepthTextColor(d) {
  if (!d || d < 0) return DEPTH_THRESHOLDS[0].textColor;
  for (const t of DEPTH_THRESHOLDS) {
    if (d <= t.max) return t.textColor;
  }
  return DEPTH_THRESHOLDS[DEPTH_THRESHOLDS.length - 1].textColor;
}

export const MAP_CENTER = process.env.REACT_APP_MAP_CENTER
  ? process.env.REACT_APP_MAP_CENTER.split(',').map(Number)
  : [-5.5544, 120.1980];

export const MAP_ZOOM = parseInt(process.env.REACT_APP_MAP_ZOOM, 10) || 14;

export const BMKG_STATION_CODE = process.env.REACT_APP_BMKG_STATION || '73.02.02.1003';
export const BMKG_API_BASE = process.env.REACT_APP_BMKG_API || 'https://bmkg-restapi.vercel.app/v1/weather';

export const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:4000';

export function timeAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  if (diff < 60000) return 'Baru saja';
  if (diff < 3600000) return `${Math.round(diff / 60000)}m lalu`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}j lalu`;
  if (diff < 604800000) return `${Math.round(diff / 86400000)}h lalu`;
  return new Date(dateStr).toLocaleDateString('id-ID');
}
