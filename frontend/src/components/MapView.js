import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import maplibregl from 'maplibre-gl';
import socket from '../services/socket';
import { Form, Badge } from 'react-bootstrap';

function PopupContent({ report }) {
  const d = report.water_depth || 0;
  const v = report.verified === 1 || report.verified === true;
  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 13 }}>
      <h6 className="mb-1 text-primary" style={{ margin: '0 0 4px' }}>{report.location_name || 'Lokasi Tidak Diketahui'}</h6>
      <small className="text-muted">{report.created_at ? new Date(report.created_at).toLocaleString('id-ID') : ''}</small>
      <div style={{ display: 'flex', gap: 8, margin: '6px 0' }}>
        <span style={{ background: '#0dcaf0', color: '#000', padding: '2px 8px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>💧 {d || '?'} cm</span>
        <span style={{ background: v ? '#198754' : '#ffc107', color: v ? '#fff' : '#000', padding: '2px 8px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>{v ? 'Terverifikasi' : 'Menunggu'}</span>
      </div>
      {report.description && <p style={{ margin: '0 0 4px', fontSize: 12 }}>{report.description}</p>}
    </div>
  );
}

function MapView() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markersRef = useRef(new Map());
  const weatherExpiry = useRef(null);
  const [weather, setWeather] = useState(null);
  const [showLayer, setShowLayer] = useState({ genangan: true, markers: true });

  const getColor = useCallback((v, d) => v ? (d > 50 ? '#dc3545' : '#ff8f00') : '#9e9e9e', []);

  const addMarker = useCallback((report) => {
    if (!map.current || markersRef.current.has(report.id)) return;
    const depth = report.water_depth || 0;
    const verified = report.verified === 1 || report.verified === true;
    const size = Math.min(36, 16 + depth * 0.3);
    const el = document.createElement('div');
    el.style.cssText = `width:${size}px;height:${size}px;background:${getColor(verified, depth)};border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;`;
    el.title = `${report.location_name || ''} - ${depth}cm`;
    const popupRoot = document.createElement('div');
    const root = ReactDOM.createRoot(popupRoot);
    root.render(React.createElement(PopupContent, { report }));
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([report.longitude, report.latitude])
      .setPopup(new maplibregl.Popup({ offset: 25, maxWidth: '280px' }).setDOMContent(popupRoot))
      .addTo(map.current);
    markersRef.current.set(report.id, { marker, root });
  }, [getColor]);

  useEffect(() => {
    if (!mapContainer.current) return;
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [120.1980, -5.5544],
      zoom: 14, maxZoom: 17, minZoom: 12,
      maxBounds: [[119.95, -5.65], [120.45, -5.40]],
    });
    map.current.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    map.current.on('load', async () => {
      try {
        const { default: api } = await import('../services/api');
        const res = await api.get('/reports?limit=200');
        const reports = Array.isArray(res.data) ? res.data : (res.data.rows || []);
        reports.forEach(addMarker);

        const { getCurrentWeather } = await import('../services/bmkg');
        getCurrentWeather().then(w => {
          setWeather(w);
          if (weatherExpiry.current) clearTimeout(weatherExpiry.current);
          weatherExpiry.current = setTimeout(() => setWeather(null), 600000);
        }).catch(() => {});
      } catch (e) { console.error(e); }

      socket.on('new_report', (report) => { if (report && report.id) addMarker(report); });
    });

    return () => {
      socket.off('new_report');
      markersRef.current.forEach(({ marker, root }) => { root.unmount(); marker.remove(); });
      markersRef.current.clear();
      if (weatherExpiry.current) clearTimeout(weatherExpiry.current);
      map.current?.remove();
    };
  }, [addMarker]);

  return (
    <div className="position-relative w-100 h-100">
      <div ref={mapContainer} className="w-100 h-100" />
      <div className="position-absolute top-0 end-0 m-2 d-flex flex-column gap-1" style={{ zIndex: 10 }}>
        {[{ key: 'genangan', label: 'Area Genangan', color: '#42a5f5' }, { key: 'markers', label: 'Marker', color: '#dc3545' }].map(l => (
          <Form.Check key={l.key} type="switch" id={`layer-${l.key}`} label={l.label}
            checked={showLayer[l.key]}
            onChange={() => setShowLayer(s => ({ ...s, [l.key]: !s[l.key] }))}
            className="bg-white bg-opacity-90 rounded px-2 py-1 shadow-sm" style={{ fontSize: 12 }} />
        ))}
      </div>
      <div className="position-absolute p-2 bg-white bg-opacity-90 rounded shadow-sm" style={{ zIndex: 10, fontSize: 11, lineHeight: 1.8, bottom: '70px', left: 8 }}>
        <strong className="fs-6">Kedalaman Air</strong><br />
        <span className="d-inline-block rounded" style={{ width: 10, height: 10, background: '#ccf2ff' }} /> 0-20 cm<br />
        <span className="d-inline-block rounded" style={{ width: 10, height: 10, background: '#66ccff' }} /> 20-50 cm<br />
        <span className="d-inline-block rounded" style={{ width: 10, height: 10, background: '#0066cc' }} /> 50-100 cm<br />
        <span className="d-inline-block rounded" style={{ width: 10, height: 10, background: '#003366' }} /> &gt;100 cm
      </div>
    </div>
  );
}

export default MapView;
