import React, { useRef, useEffect, useState } from 'react';
import { Button, Spinner } from 'react-bootstrap';

function CameraCapture({ onCapture, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [captured, setCaptured] = useState(false);

  useEffect(() => { startCamera(); return () => stopCamera(); }, []);

  const startCamera = async () => {
    setLoading(true); setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      setLoading(false);
    } catch (e) {
      setLoading(false);
      if (e.name === 'NotAllowedError') setError('Izin kamera ditolak. Izinkan akses kamera di pengaturan browser.');
      else if (e.name === 'NotFoundError') setError('Kamera tidak ditemukan di perangkat ini.');
      else setError('Gagal mengakses kamera: ' + e.message);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  };

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      const file = new File([blob], `flood_${Date.now()}.jpg`, { type: 'image/jpeg' });
      stopCamera(); setCaptured(true); onCapture(file);
    }, 'image/jpeg', 0.9);
  };

  if (captured) return null;

  return (
    <div className="position-relative rounded overflow-hidden bg-dark" style={{ minHeight: 300 }}>
      {!error && (
        <video ref={videoRef} autoPlay playsInline muted
          className="w-100 h-100"
          style={{ objectFit: 'cover', minHeight: 300, display: loading ? 'none' : 'block' }}
        />
      )}
      {loading && (
        <div className="d-flex flex-column align-items-center justify-content-center text-white" style={{ minHeight: 300 }}>
          <Spinner animation="border" variant="light" />
          <p className="mt-2 small">Mengakses kamera...</p>
        </div>
      )}
      {error && (
        <div className="d-flex flex-column align-items-center justify-content-center text-white p-4" style={{ minHeight: 300 }}>
          <span className="fs-1 mb-2">📷</span>
          <p className="text-center small mb-3">{error}</p>
          <div className="d-flex gap-2">
            <Button variant="outline-light" size="sm" onClick={onCancel}>Batal</Button>
            <Button variant="light" size="sm" onClick={startCamera}>Coba Lagi</Button>
          </div>
        </div>
      )}
      {!loading && !error && (
        <div className="position-absolute bottom-0 start-0 end-0 p-3 d-flex justify-content-center gap-3" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.7))' }}>
          <Button variant="light" size="sm" onClick={onCancel}>Batal</Button>
          <Button variant="danger" className="rounded-circle d-flex align-items-center justify-content-center"
            style={{ width: 56, height: 56, border: '4px solid white' }} onClick={handleCapture} />
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}

export default CameraCapture;
