import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import socket from '../services/socket';
import { getCurrentWeather, weatherCodeToLabel, isRainyWeather } from '../services/bmkg';
import { Badge } from 'react-bootstrap';

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:4000';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png', iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png' });

const waterIcon = L.divIcon({
  html: '<svg width="24" height="24" viewBox="0 0 24 24"><path fill="#1e90ff" d="M12 2s5 5.5 5 9a5 5 0 1 1-10 0c0-3.5 5-9 5-9z"/></svg>',
  className: '', iconSize: [24, 24], iconAnchor: [12, 24],
});

function zoneColor(level) {
  return level === 'tinggi' ? '#e74c3c' : level === 'sedang' ? '#f39c12' : '#f1c40f';
}

function getDepthColor(d) {
  if (!d || d <= 20) return '#ccf2ff';
  if (d <= 50) return '#66ccff';
  if (d <= 100) return '#0066cc';
  return '#003366';
}

function computeFloodZones(reports) {
  if (!reports || reports.length < 2) return { type: 'FeatureCollection', features: [] };

  const groups = [];
  const used = new Set();

  for (let i = 0; i < reports.length; i++) {
    if (used.has(i)) continue;
    const group = [reports[i]];
    used.add(i);
    for (let j = i + 1; j < reports.length; j++) {
      if (used.has(j)) continue;
      const d = Math.sqrt(
        (reports[i].latitude - reports[j].latitude) ** 2 +
        (reports[i].longitude - reports[j].longitude) ** 2
      );
      if (d < 0.008) {
        group.push(reports[j]);
        used.add(j);
      }
    }
    if (group.length >= 2) groups.push(group);
  }

  const features = groups.map(group => {
    const lats = group.map(r => r.latitude);
    const lngs = group.map(r => r.longitude);
    const avgDepth = group.reduce((s, r) => s + (r.water_depth || 0), 0) / group.length;
    const level = avgDepth > 50 ? 'tinggi' : avgDepth > 20 ? 'sedang' : 'rendah';

    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const buf = 0.002;
    const coords = [[
      [minLng - buf, minLat - buf],
      [maxLng + buf, minLat - buf],
      [maxLng + buf, maxLat + buf],
      [minLng - buf, maxLat + buf],
      [minLng - buf, minLat - buf],
    ]];

    return {
      type: 'Feature',
      properties: { level, name: `Zona ${level === 'tinggi' ? 'Tinggi' : level === 'sedang' ? 'Sedang' : 'Rendah'}`, info: `Rata-rata kedalaman ${Math.round(avgDepth)}cm`, avgDepth: Math.round(avgDepth) },
      geometry: { type: 'Polygon', coordinates: coords },
    };
  });

  return { type: 'FeatureCollection', features };
}

function MapView() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);
  const zonesRef = useRef(null);
  const clusterRef = useRef(null);
  const locateCircleRef = useRef(null);
  const weatherExpiry = useRef(null);
  const allReportsRef = useRef([]);
  const layersControlRef = useRef(null);
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = L.map(mapContainer.current, { zoomControl: true }).setView([-5.5544, 120.1980], 14);
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (c) => {
        const count = c.getChildCount();
        const color = count > 5 ? '#e74c3c' : count > 2 ? '#f39c12' : '#3498db';
        return L.divIcon({
          html: `<div style="background:${color};color:white;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:13px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${count}</div>`,
          className: '', iconSize: [36, 36],
        });
      },
    });
    clusterRef.current = cluster;

    const zonesLayer = L.geoJSON(null, {
      style: (f) => {
        const lvl = f.properties.level;
        const color = zoneColor(lvl);
        return { color, fillColor: color, fillOpacity: 0.3, weight: 1.5, dashArray: '4 4' };
      },
      onEachFeature: (f, layer) => {
        const p = f.properties;
        layer.bindPopup(`<b>${p.name}</b><br>${p.info}`);
        layer.on({
          mouseover: (e) => e.target.setStyle({ fillOpacity: 0.5, weight: 2.5 }),
          mouseout: (e) => zonesLayer.resetStyle(e.target),
        });
      },
    });
    zonesRef.current = zonesLayer;

    const overlayMaps = {
      'Zona Banjir': zonesLayer,
      'Laporan Warga': cluster,
    };
    layersControlRef.current = L.control.layers(null, overlayMaps, { collapsed: false }).addTo(map);

    // Legend
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div', '');
      div.style.cssText = 'background:white;padding:10px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.2);font-size:12px;line-height:1.8;min-width:120px';
      div.innerHTML = `
        <b style="font-size:14px;display:block;margin-bottom:4px">Kedalaman Air</b>
        <div style="display:flex;align-items:center;gap:8px"><span style="width:16px;height:10px;background:#ccf2ff;display:inline-block;border-radius:2px"></span> 0-20 cm</div>
        <div style="display:flex;align-items:center;gap:8px"><span style="width:16px;height:10px;background:#66ccff;display:inline-block;border-radius:2px"></span> 20-50 cm</div>
        <div style="display:flex;align-items:center;gap:8px"><span style="width:16px;height:10px;background:#0066cc;display:inline-block;border-radius:2px"></span> 50-100 cm</div>
        <div style="display:flex;align-items:center;gap:8px"><span style="width:16px;height:10px;background:#003366;display:inline-block;border-radius:2px"></span> &gt;100 cm</div>
        <hr style="margin:6px 0"/>
        <div style="display:flex;align-items:center;gap:8px"><span style="width:16px;height:10px;background:#f1c40f;display:inline-block;border-radius:2px"></span> Rendah</div>
        <div style="display:flex;align-items:center;gap:8px"><span style="width:16px;height:10px;background:#f39c12;display:inline-block;border-radius:2px"></span> Sedang</div>
        <div style="display:flex;align-items:center;gap:8px"><span style="width:16px;height:10px;background:#e74c3c;display:inline-block;border-radius:2px"></span> Tinggi</div>
      `;
      return div;
    };
    legend.addTo(map);

    // Locate button
    const locateBtn = L.control({ position: 'topleft' });
    locateBtn.onAdd = () => {
      const btn = L.DomUtil.create('button', 'leaflet-bar');
      btn.innerHTML = '📍';
      btn.title = 'Lokasi Saya';
      btn.style.cssText = 'padding:8px 12px;font-size:18px;cursor:pointer;background:white;border:none;display:block;';
      btn.onclick = () => map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true });
      return btn;
    };
    locateBtn.addTo(map);

    map.on('locationfound', (e) => {
      if (locateCircleRef.current) map.removeLayer(locateCircleRef.current);
      locateCircleRef.current = L.circle(e.latlng, { radius: e.accuracy / 2, color: '#1e90ff', fillOpacity: 0.1, weight: 2 }).addTo(map);
    });
    map.on('locationerror', () => {});

    // Load data
    Promise.all([
      fetch(BASE + '/api/reports?limit=500').then(r => r.json()),
      getCurrentWeather(),
    ]).then(([data, w]) => {
      setWeather(w);
      if (weatherExpiry.current) clearTimeout(weatherExpiry.current);
      weatherExpiry.current = setTimeout(() => setWeather(null), 600000);

      const reports = Array.isArray(data) ? data : (data.rows || []);
      allReportsRef.current = reports;

      // Add markers to cluster
      reports.forEach(r => {
        const depth = r.water_depth || 0;
        const verified = r.verified === 1 || r.verified === true;
        const color = verified ? (depth > 50 ? '#e74c3c' : '#f39c12') : '#95a5a6';
        const size = Math.min(30, 14 + depth * 0.25);

        const marker = L.marker([r.latitude, r.longitude], {
          icon: L.divIcon({
            html: `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:white">${depth > 0 ? depth : ''}</div>`,
            className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
          }),
        });
        marker.bindPopup(`
          <div style="font-family:sans-serif;font-size:13px">
            <b style="color:#0d6efd">${r.location_name || 'Lokasi Tidak Diketahui'}</b><br/>
            <small style="color:#6c757d">${new Date(r.created_at).toLocaleString('id-ID')}</small>
            <div style="display:flex;gap:8px;margin:6px 0">
              <span style="background:#0dcaf0;color:#000;padding:2px 8px;border-radius:8px;font-size:13px;font-weight:600">💧 ${depth} cm</span>
              <span style="background:${verified ? '#198754' : '#ffc107'};color:${verified ? '#fff' : '#000'};padding:2px 8px;border-radius:8px;font-size:13px;font-weight:600">${verified ? 'Terverifikasi' : 'Menunggu'}</span>
            </div>
            ${r.description ? `<p style="margin:4px 0;font-size:12px">${r.description}</p>` : ''}
            ${r.image_url ? `<img src="${BASE}${r.image_url}" style="width:100%;border-radius:6px;max-height:120px;object-fit:cover"/>` : ''}
          </div>
        `);
        cluster.addLayer(marker);
      });
      map.addLayer(cluster);

      // Compute and add flood zones
      const zones = computeFloodZones(reports);
      zonesRef.current.addData(zones);
      map.addLayer(zonesRef.current);
    }).catch(e => console.error(e));

    // Socket new report
    socket.on('new_report', (report) => {
      if (!report || !report.id) return;
      const depth = report.water_depth || 0;
      const verified = report.verified === 1 || report.verified === true;
      const color = verified ? (depth > 50 ? '#e74c3c' : '#f39c12') : '#95a5a6';
      const size = Math.min(30, 14 + depth * 0.25);
      const marker = L.marker([report.latitude, report.longitude], {
        icon: L.divIcon({
          html: `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${depth > 0 ? depth : ''}</div>`,
          className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
        }),
      });
      marker.bindPopup(`<b>${report.location_name || 'Lokasi'}</b><br/>💧 ${depth} cm`);
      cluster.addLayer(marker);
      allReportsRef.current.push(report);
      // Recompute zones
      zonesRef.current.clearLayers();
      const zones = computeFloodZones(allReportsRef.current);
      zonesRef.current.addData(zones);
    });

    return () => {
      socket.off('new_report');
      if (weatherExpiry.current) clearTimeout(weatherExpiry.current);
      if (locateCircleRef.current) map.removeLayer(locateCircleRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="position-relative w-100 h-100">
      <div ref={mapContainer} className="w-100 h-100" />
      {weather && weather.current && (
        <div className={`position-absolute top-0 start-0 m-2 p-2 rounded shadow-sm ${isRainyWeather(weather.current.weather_code) ? 'bg-danger bg-opacity-90 text-white' : 'bg-white bg-opacity-90'}`} style={{ zIndex: 1000, fontSize: 12, maxWidth: 220 }}>
          <div className="d-flex align-items-center gap-1 fw-semibold">
            <span>🌤</span> BMKG
            <Badge bg={isRainyWeather(weather.current.weather_code) ? 'light' : 'primary'} text="dark" className="ms-auto">{weatherCodeToLabel(weather.current.weather_code)}</Badge>
          </div>
          <div className="d-flex gap-2 mt-1">
            <span>🌡 {weather.current.temperature_c}°C</span>
            <span>💧 {weather.current.humidity_pct}%</span>
            <span>🌬 {weather.current.wind_speed_kmh} km/h</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default MapView;
