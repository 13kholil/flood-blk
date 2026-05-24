const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'flood.db');
let db;

function initDB() {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      location_name TEXT DEFAULT '',
      water_depth INTEGER DEFAULT 0,
      description TEXT DEFAULT '',
      image_url TEXT,
      verified INTEGER DEFAULT 0,
      exif_data TEXT,
      photo_taken_at TEXT,
      gps_accuracy REAL DEFAULT 0,
      device_info TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const count = db.prepare('SELECT COUNT(*) as c FROM reports').get().c;
  if (count === 0) seedData();
  console.log(`Database ready (${count} reports)`);
}

function seedData() {
  const reports = [
    { lat: -5.5403, lng: 120.1931, loc: 'Jl. Sam Ratulangi', depth: 35, desc: 'Genangan air di depan kantor bupati, lalu lintas tersendat', verified: 1 },
    { lat: -5.5470, lng: 120.1900, loc: 'Jl. Ahmad Yani', depth: 50, desc: 'Banjir setinggi paha orang dewasa, motor tidak bisa lewat', verified: 1 },
    { lat: -5.5510, lng: 120.1960, loc: 'Jl. Jenderal Sudirman', depth: 20, desc: 'Genangan di depan pasar sentral', verified: 1 },
    { lat: -5.5560, lng: 120.1880, loc: 'Jl. Pahlawan', depth: 60, desc: 'Banjir cukup parah, mobil hanya bisa lewat dengan hati-hati', verified: 1 },
    { lat: -5.5600, lng: 120.2000, loc: 'Kelurahan Caile', depth: 80, desc: 'Banjir merendam rumah warga, ketinggian air mencapai 80cm', verified: 1 },
    { lat: -5.5350, lng: 120.2100, loc: 'Jl. Poros Bulukumba-Sinjai', depth: 25, desc: 'Genangan di badan jalan, masih bisa dilalui kendaraan', verified: 0 },
    { lat: -5.5650, lng: 120.1820, loc: 'Kecamatan Ujung Bulu', depth: 45, desc: 'Air mulai naik sejak pukul 14.00 WITA', verified: 1 },
    { lat: -5.5300, lng: 120.2200, loc: 'Jl. Poros Bulukumba-Bantaeng', depth: 15, desc: 'Genangan tipis, masih aman dilalui', verified: 1 },
    { lat: -5.5480, lng: 120.1870, loc: 'Pasar Sentral Bulukumba', depth: 30, desc: 'Area parkir pasar tergenang, aktivitas jual beli terganggu', verified: 0 },
    { lat: -5.5530, lng: 120.1860, loc: 'Jl. KH Wahid Hasyim', depth: 55, desc: 'Banjir meluas, warga mulai mengungsi ke tempat lebih tinggi', verified: 1 },
    { lat: -5.5440, lng: 120.1830, loc: 'Kompleks Perkantoran Pemkab', depth: 10, desc: 'Genangan tipis di halaman kantor', verified: 1 },
    { lat: -5.5700, lng: 120.1800, loc: 'Kelurahan Tanah Kongkong', depth: 70, desc: 'Banjir merendam pemukiman padat penduduk', verified: 0 },
  ];

  const stmt = db.prepare(
    `INSERT INTO reports (latitude, longitude, location_name, water_depth, description, verified)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  db.transaction((items) => {
    for (const r of items) stmt.run(r.lat, r.lng, r.loc, r.depth, r.desc, r.verified);
  })(reports);
  console.log(`Seeded ${reports.length} reports`);
}

function createReport(fields) {
  const stmt = db.prepare(
    `INSERT INTO reports (latitude, longitude, location_name, water_depth, description, image_url, exif_data, photo_taken_at, gps_accuracy, device_info)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const info = stmt.run(
    fields.latitude, fields.longitude, fields.location_name || '',
    Math.max(0, parseInt(fields.water_depth) || 0),
    fields.description || '', fields.imageUrl,
    fields.exifData || null, fields.photoTakenAt || null,
    fields.gpsAccuracy || 0, fields.deviceInfo || null
  );
  return db.prepare('SELECT * FROM reports WHERE id = ?').get(info.lastInsertRowid);
}

function getAllReports(page = 1, limit = 50) {
  const offset = Math.max(0, (page - 1) * limit);
  const total = db.prepare('SELECT COUNT(*) as c FROM reports').get().c;
  const rows = db.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  return { rows, total, page, limit, pages: Math.ceil(total / limit) };
}

function getReport(id) {
  return db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
}

function getStats() {
  const total = db.prepare('SELECT COUNT(*) as value FROM reports').get().value;
  const verified = db.prepare('SELECT COUNT(*) as value FROM reports WHERE verified = 1').get().value;
  const avgDepth = db.prepare('SELECT ROUND(AVG(water_depth), 1) as value FROM reports WHERE water_depth > 0').get().value || 0;
  const maxDepth = db.prepare('SELECT MAX(water_depth) as value FROM reports').get().value || 0;
  const today = db.prepare("SELECT COUNT(*) as value FROM reports WHERE date(created_at) = date('now')").get().value;
  const recent = db.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT 5').all();
  const byLocation = db.prepare(`
    SELECT location_name, COUNT(*) as count, ROUND(AVG(water_depth), 1) as avg_depth
    FROM reports WHERE location_name IS NOT NULL AND location_name != ''
    GROUP BY location_name ORDER BY count DESC LIMIT 10
  `).all();
  return { total, verified, avgDepth, maxDepth, today, recent, byLocation };
}

function updateVerification(id, verified) {
  db.prepare('UPDATE reports SET verified = ? WHERE id = ?').run(verified ? 1 : 0, id);
  return getReport(id);
}

function findNearbyReports(lat, lng, radiusMeters = 50) {
  const deg = radiusMeters / 111320;
  const cosLat = Math.max(0.01, Math.cos(Math.abs(lat) * Math.PI / 180));
  const lngDeg = radiusMeters / (111320 * cosLat);
  const rows = db.prepare(`
    SELECT *, (
      (latitude - ?) * (latitude - ?) +
      (longitude - ?) * (longitude - ?) * ? * ?
    ) as dist_sq
    FROM reports
    WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?
    ORDER BY dist_sq ASC LIMIT 5
  `).all(lat, lat, lng, lng, cosLat, cosLat,
    lat - deg, lat + deg, lng - lngDeg, lng + lngDeg
  );
  return rows
    .map(r => ({ ...r, distance_m: Math.round(Math.sqrt(r.dist_sq) * 111320) }))
    .filter(r => r.distance_m <= radiusMeters);
}

module.exports = { initDB, createReport, getAllReports, getReport, getStats, updateVerification, findNearbyReports };
