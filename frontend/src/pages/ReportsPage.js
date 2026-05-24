import React, { useEffect, useState } from 'react';
import { Form, Spinner, Alert, Badge } from 'react-bootstrap';
import axios from 'axios';

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:4000';

function getDepthColor(depth) {
  if (!depth) return '#e9ecef';
  if (depth <= 20) return '#ccf2ff';
  if (depth <= 50) return '#66ccff';
  if (depth <= 100) return '#0066cc';
  return '#003366';
}

function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    axios.get(BASE + '/api/reports?limit=200').then(r => {
      const data = r.data;
      setReports(Array.isArray(data) ? data : (data.rows || []));
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = reports.filter(r => {
    if (filter === 'verified' && !(r.verified == 1)) return false;
    if (filter === 'unverified' && (r.verified == 1)) return false;
    if (filter === 'deep' && (r.water_depth || 0) < 50) return false;
    if (search && r.location_name && !r.location_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="primary" /><p className="mt-2 text-muted">Memuat laporan...</p></div>;

  return (
    <div className="p-3">
      <div className="d-flex gap-2 mb-3">
        <Form.Control size="sm" placeholder="Cari lokasi..." value={search} onChange={e => setSearch(e.target.value)} />
        <Form.Select size="sm" value={filter} onChange={e => setFilter(e.target.value)} style={{ maxWidth: 140 }}>
          <option value="all">Semua</option>
          <option value="verified">Terverifikasi</option>
          <option value="unverified">Menunggu</option>
          <option value="deep">Kedalaman &gt;50cm</option>
        </Form.Select>
      </div>
      <div className="text-muted small mb-2">Menampilkan {filtered.length} dari {reports.length} laporan</div>
      {filtered.map(r => (
        <div key={r.id} className="card shadow-sm mb-2 border-0">
          <div className="card-body p-3 d-flex gap-3">
            <div className="rounded d-flex flex-column align-items-center justify-content-center flex-shrink-0"
              style={{ width: 50, height: 50, background: getDepthColor(r.water_depth), color: (r.water_depth || 0) > 50 ? 'white' : '#003366' }}>
              <span className="fw-bold fs-5 lh-1">{r.water_depth || '?'}</span>
              <span className="small lh-1">cm</span>
            </div>
            <div className="flex-grow-1 min-w-0">
              <div className="fw-semibold small">{r.location_name || 'Lokasi tidak diketahui'}</div>
              <small className="text-muted d-block">{new Date(r.created_at).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
              {r.description && <p className="small text-secondary mb-1 mt-1">{r.description}</p>}
              <div className="d-flex gap-1 flex-wrap">
                <Badge bg={r.verified == 1 ? 'success' : 'warning'} text={r.verified == 1 ? 'white' : 'dark'}>{r.verified == 1 ? 'Terverifikasi' : 'Menunggu'}</Badge>
                {r.image_url && <Badge bg="info">Ada foto</Badge>}
              </div>
            </div>
          </div>
        </div>
      ))}
      {filtered.length === 0 && <Alert variant="info" className="text-center">Tidak ada laporan ditemukan</Alert>}
    </div>
  );
}

export default ReportsPage;
