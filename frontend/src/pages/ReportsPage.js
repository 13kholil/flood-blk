import React, { useEffect, useState, useCallback } from 'react';
import { Form, Spinner, Alert, Badge, Button, Modal } from 'react-bootstrap';
import axios from 'axios';
import { getDepthColor, getDepthLabel, getDepthTextColor, timeAgo, API_BASE } from '../constants';

const PAGE_SIZE = 20;

function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [previewImg, setPreviewImg] = useState(null);

  const fetchReports = useCallback(async (p) => {
    setLoading(true);
    try {
      const res = await axios.get(API_BASE + '/api/reports', { params: { page: p, limit: PAGE_SIZE } });
      const data = res.data;
      setReports(data.rows || []);
      setTotal(data.total || 0);
      setTotalPages(data.pages || 1);
      setPage(data.page || 1);
    } catch (e) {
      console.error(e);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReports(1); }, [fetchReports]);

  const filtered = reports.filter(r => {
    if (filter === 'verified' && !(r.verified == 1)) return false;
    if (filter === 'unverified' && (r.verified == 1)) return false;
    if (filter === 'deep' && (r.water_depth || 0) < 50) return false;
    if (search && r.location_name && !r.location_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading && reports.length === 0) return <div className="text-center py-5"><Spinner animation="border" variant="primary" /><p className="mt-2 text-muted">Memuat laporan...</p></div>;

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
      <div className="text-muted small mb-2">Menampilkan {filtered.length} dari {total} laporan (hal. {page}/{totalPages})</div>
      {filtered.map(r => (
        <div key={r.id} className="card shadow-sm mb-2 border-0">
          <div className="card-body p-3">
            <div className="d-flex gap-3">
              <div className="rounded d-flex flex-column align-items-center justify-content-center flex-shrink-0"
                style={{ width: 50, height: 50, background: getDepthColor(r.water_depth), color: getDepthTextColor(r.water_depth) }}>
                <span className="fw-bold fs-5 lh-1">{r.water_depth || '?'}</span>
                <span className="small lh-1">cm</span>
              </div>
              <div className="flex-grow-1 min-w-0">
                <div className="fw-semibold small">{r.location_name || 'Lokasi tidak diketahui'}</div>
                <small className="text-muted d-block">
                  {new Date(r.created_at).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  <span className="ms-1 text-secondary">({timeAgo(r.created_at)})</span>
                </small>
                {r.description && <p className="small text-secondary mb-1 mt-1">{r.description}</p>}
                <div className="d-flex gap-1 flex-wrap align-items-center">
                  <Badge bg={r.verified == 1 ? 'success' : 'warning'} text={r.verified == 1 ? 'white' : 'dark'}>{r.verified == 1 ? 'Terverifikasi' : 'Menunggu'}</Badge>
                  <Badge bg={getDepthColor(r.water_depth)} style={{ color: getDepthTextColor(r.water_depth) }}>
                    {getDepthLabel(r.water_depth)}
                  </Badge>
                  {r.image_url && (
                    <Badge bg="info" style={{ cursor: 'pointer' }} onClick={() => setPreviewImg(API_BASE + r.image_url)}>
                      🖼 Lihat foto
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
      {filtered.length === 0 && <Alert variant="info" className="text-center">Tidak ada laporan ditemukan</Alert>}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="d-flex justify-content-center gap-2 mt-3 mb-4">
          <Button size="sm" variant="outline-primary" disabled={page <= 1} onClick={() => fetchReports(page - 1)}>← Prev</Button>
          <span className="d-flex align-items-center small px-2">{page} / {totalPages}</span>
          <Button size="sm" variant="outline-primary" disabled={page >= totalPages} onClick={() => fetchReports(page + 1)}>Next →</Button>
        </div>
      )}

      {/* Image preview modal */}
      <Modal show={!!previewImg} onHide={() => setPreviewImg(null)} centered size="lg">
        <Modal.Body className="p-0 bg-dark text-center">
          {previewImg && <img src={previewImg} alt="foto banjir" className="w-100" style={{ maxHeight: '80vh', objectFit: 'contain' }} />}
        </Modal.Body>
        <Modal.Footer className="p-2 d-flex justify-content-center border-0 bg-dark">
          <Button variant="light" size="sm" onClick={() => setPreviewImg(null)}>Tutup</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default ReportsPage;
