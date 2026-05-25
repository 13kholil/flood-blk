import React, { useState, useCallback, useEffect } from 'react';
import { Modal, Button, Spinner, Alert, Badge, Form, ProgressBar } from 'react-bootstrap';
import CameraCapture from './CameraCapture';
import axios from 'axios';
import exifr from 'exifr';
import { detectFloodWater, checkAuthenticity } from '../services/vision';
import { API_BASE } from '../constants';

function detectDeviceInfo() {
  const info = { platform: navigator.platform || '', language: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, screen: `${screen.width}x${screen.height}`, cores: navigator.hardwareConcurrency || 0, connection: '' };
  if (navigator.connection) { info.connection = navigator.connection.effectiveType || ''; if (navigator.connection.downlink) info.connection += ` (${navigator.connection.downlink}Mbps)`; }
  return info;
}

async function uploadReport(fd, onProgress) {
  const res = await axios.post(API_BASE + '/api/reports', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress,
  });
  return res.data;
}

async function checkNearby(lat, lng) {
  const res = await axios.get(API_BASE + '/api/reports/nearby', { params: { lat, lng, radius: 50 } });
  return res.data;
}

function ReportForm({ onClose, onSubmitSuccess }) {
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [waterDepth, setWaterDepth] = useState(15);
  const [description, setDescription] = useState('');
  const [gps, setGps] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [deviceInfo] = useState(detectDeviceInfo);
  const [validation, setValidation] = useState(null);

  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  const startGps = useCallback(() => {
    if (!navigator.geolocation) { setError('Geolokasi tidak didukung'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }); setStep(1); },
      (err) => { let msg = 'Akses lokasi ditolak'; if (err.code === 2) msg = 'Sinyal GPS tidak tersedia'; else if (err.code === 3) msg = 'Waktu habis'; setError(msg); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }, []);

  const handleCapture = useCallback(async (file) => {
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    setShowCamera(false);
    setStep(2);

    // Run vision validation
    const [floodResult, authResult] = await Promise.all([
      detectFloodWater(file),
      checkAuthenticity(file, null),
    ]);
    setValidation({ flood: floodResult, auth: authResult });
  }, [preview]);

  const handleFilePick = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    setStep(2);

    const [floodResult, authResult] = await Promise.all([
      detectFloodWater(file),
      checkAuthenticity(file, null),
    ]);
    setValidation({ flood: floodResult, auth: authResult });
  }, [preview]);

  const handleSubmit = async () => {
    if (!gps || !photo) return;
    setLoading(true); setError(''); setUploadProgress(0);
    try {
      const fd = new FormData();
      fd.append('latitude', gps.lat);
      fd.append('longitude', gps.lng);
      fd.append('gps_accuracy', String(Math.round(gps.accuracy || 0)));
      fd.append('location_name', `Lokasi (${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)})`);
      fd.append('water_depth', String(Math.max(0, Math.min(500, parseInt(waterDepth, 10) || 0))));
      fd.append('description', description.trim().slice(0, 1000));
      fd.append('photo', photo);
      fd.append('device_info', JSON.stringify(deviceInfo));

      // Extract and send EXIF
      try {
        const exif = await exifr.parse(photo, ['Make', 'Model', 'DateTimeOriginal']);
        if (exif) {
          fd.append('exif_data', JSON.stringify({ Make: exif.Make, Model: exif.Model }));
          if (exif.DateTimeOriginal) fd.append('photo_taken_at', new Date(exif.DateTimeOriginal).toISOString());
        }
      } catch {}

      await uploadReport(fd, (e) => { if (e.total > 0) setUploadProgress(Math.round((e.loaded / e.total) * 100)); });
      if (onSubmitSuccess) onSubmitSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal mengirim laporan');
    } finally { setLoading(false); setUploadProgress(0); }
  };

  const validationBadge = validation ? (
    <div className="small mb-2">
      {validation.flood.isWater ? (
        <Badge bg="success" className="me-1">✅ Air terdeteksi ({validation.flood.confidence}%)</Badge>
      ) : (
        <Badge bg="warning" text="dark" className="me-1">⚠️ Air tidak terdeteksi</Badge>
      )}
      {validation.auth.isAuthentic ? (
        <Badge bg="success">✅ Foto asli ({validation.auth.score}%)</Badge>
      ) : (
        <Badge bg="warning" text="dark">⚠️ Foto perlu diperiksa ({validation.auth.score}%)</Badge>
      )}
    </div>
  ) : null;

  return (
    <Modal show centered onHide={onClose} backdrop="static" size="md">
      <Modal.Header closeButton className="bg-primary text-white">
        <Modal.Title className="fs-6">🚨 Lapor Banjir</Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-3">
        <div className="d-flex gap-1 mb-3">
          {['Deteksi Lokasi', 'Ambil Foto', 'Isi Detail'].map((l, i) => (
            <div key={i} className={`flex-fill text-center py-2 px-1 rounded small fw-semibold ${step === i ? 'bg-primary text-white' : step > i ? 'bg-success text-white' : 'bg-light text-muted'}`}>
              {step > i ? '✓' : step === i ? '●' : '○'} {l}
            </div>
          ))}
        </div>

        {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

        {step === 0 && !gps && (
          <div className="text-center py-4">
            <p className="text-muted mb-3">Aktifkan GPS untuk mendeteksi lokasi Anda</p>
            <Button variant="primary" onClick={startGps}>📍 Deteksi Lokasi Saya</Button>
          </div>
        )}

        {step >= 1 && (
          <>
            {showCamera ? (
              <CameraCapture onCapture={handleCapture} onCancel={() => setShowCamera(false)} />
            ) : (
              <div>
                <div className={`rounded p-3 mb-2 text-center border-2 ${photo ? 'bg-light' : 'border-primary'}`}
                  style={{ border: photo ? '1px solid #dee2e6' : '2px dashed #0d6efd', cursor: photo ? 'default' : 'pointer', background: photo ? '#f8f9fa' : '#f0f4ff' }}>
                  {!photo ? (
                    <div onClick={() => setShowCamera(true)}>
                      <div className="fs-1 mb-1">📸</div>
                      <div className="fw-semibold text-primary">Ambil Foto Genangan</div>
                      <small className="text-muted d-block">Tap untuk membuka kamera</small>
                    </div>
                  ) : (
                    <div className="position-relative d-inline-block w-100">
                      <img src={preview} alt="preview" className="w-100 rounded" style={{ maxHeight: 200, objectFit: 'cover' }} />
                      <Badge bg="dark" className="position-absolute top-0 end-0 m-1 opacity-75" style={{ cursor: 'pointer' }}
                        onClick={() => { if (preview) URL.revokeObjectURL(preview); setPhoto(null); setPreview(null); setValidation(null); setStep(1); }}>📷 Ambil ulang</Badge>
                    </div>
                  )}
                </div>
                {!photo && (
                  <div className="text-center">
                    <label className="btn btn-outline-secondary btn-sm">
                      📁 Pilih dari galeri
                      <input type="file" accept="image/*" className="d-none" onChange={handleFilePick} />
                    </label>
                  </div>
                )}
                {validationBadge}
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            {validationBadge}
            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold small mb-1">💧 Perkiraan Kedalaman Air (cm)</Form.Label>
              <div className="d-flex align-items-center gap-3">
                <Form.Range min={0} max={200} step={5} value={waterDepth} onChange={e => setWaterDepth(e.target.value)} className="flex-grow-1" />
                <span className="fw-bold text-primary fs-5" style={{ minWidth: 50, textAlign: 'right' }}>{waterDepth}</span>
              </div>
              <div className="d-flex justify-content-between small text-muted"><span>0 cm</span><span>100 cm</span><span>200 cm</span></div>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold small mb-1">📝 Deskripsi Kejadian</Form.Label>
              <Form.Control as="textarea" rows={3} placeholder="Contoh: Banjir setinggi lutut..." value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} />
              <small className="text-muted">{description.length}/1000 karakter</small>
            </Form.Group>
            {uploadProgress > 0 && <div className="mb-2"><ProgressBar now={uploadProgress} label={`${uploadProgress}%`} animated /></div>}
            <Button variant="danger" size="lg" className="w-100 fw-bold" disabled={!gps || !photo || loading} onClick={handleSubmit}>
              {loading ? <><Spinner animation="border" size="sm" /> Mengirim...</> : '🚨 KIRIM LAPORAN'}
            </Button>
          </>
        )}
      </Modal.Body>
    </Modal>
  );
}

export default ReportForm;
