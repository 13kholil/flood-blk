import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import socket from '../services/socket';
import { getCurrentWeather, weatherCodeToLabel, isRainyWeather } from '../services/bmkg';
import { Badge } from 'react-bootstrap';
import { getDepthColor, getDepthLabel, MAP_CENTER, MAP_ZOOM, API_BASE } from '../constants';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png', iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png' });

function MapView() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const kelurahanLayerRef = useRef(null);
  const locateCircleRef = useRef(null);
  const weatherExpiry = useRef(null);
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = L.map(mapContainer.current, { zoomControl: true }).setView(MAP_CENTER, MAP_ZOOM);
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 18,
    }).addTo(map);

    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

    // Legend
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div', '');
      div.style.cssText = 'background:white;padding:10px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.2);font-size:11px;line-height:1.8;min-width:130px';
      div.innerHTML = `
        <b style="font-size:13px;display:block;margin-bottom:4px">Kedalaman Air</b>
        <div style="display:flex;align-items:center;gap:6px"><span style="width:14px;height:10px;background:#cccccc;display:inline-block;border-radius:2px;border:1px solid #aaa"></span> Tidak ada data</div>
        <div style="display:flex;align-items:center;gap:6px"><span style="width:14px;height:10px;background:#ccf2ff;display:inline-block;border-radius:2px;border:1px solid #8cf"></span> 0-20 cm (Rendah)</div>
        <div style="display:flex;align-items:center;gap:6px"><span style="width:14px;height:10px;background:#66ccff;display:inline-block;border-radius:2px;border:1px solid #4af"></span> 20-50 cm (Sedang)</div>
        <div style="display:flex;align-items:center;gap:6px"><span style="width:14px;height:10px;background:#0066cc;display:inline-block;border-radius:2px;border:1px solid #04a"></span> 50-100 cm (Tinggi)</div>
        <div style="display:flex;align-items:center;gap:6px"><span style="width:14px;height:10px;background:#003366;display:inline-block;border-radius:2px;border:1px solid #004"></span> &gt;100 cm (Bahaya)</div>
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

    // Load GeoJSON + weather
    Promise.all([
      fetch(API_BASE + '/data/kelurahan-ujungbulu.geojson').then(r => r.json()),
      getCurrentWeather(),
    ]).then(([geoJson, w]) => {
      setWeather(w);
      if (weatherExpiry.current) clearTimeout(weatherExpiry.current);
      weatherExpiry.current = setTimeout(() => setWeather(null), 600000);

      const kelurahanLayer = L.geoJSON(geoJson, {
        style: {
          color: '#2c3e50', fillColor: '#cccccc',
          fillOpacity: 0.15, weight: 1.5, dashArray: '2 4',
        },
        onEachFeature: (feature, layer) => {
          const p = feature.properties;
          const name = p.wadmkd || p.namobj || 'Tidak diketahui';

          layer.bindPopup(`
            <div style="font-family:sans-serif;font-size:13px;min-width:200px">
              <h6 style="margin:0 0 4px;color:#0d6efd">🏘 ${name}</h6>
              <small style="color:#6c757d">Kel. ${name}, Kec. ${p.wadmkc || 'Ujung Bulu'}</small>
              <div style="margin:8px 0">
                <span style="background:#95a5a6;color:white;padding:2px 8px;border-radius:8px;font-size:12px">Tidak ada laporan</span>
              </div>
              <div style="font-size:12px;color:#6c757d">
                Data dari BIG — Batas Wilayah Kelurahan/Desa Skala 1:10.000
              </div>
            </div>
          `);

          layer.on({
            mouseover: (e) => {
              e.target.setStyle({ fillOpacity: 0.4, weight: 2.5 });
              e.target.bringToFront();
            },
            mouseout: (e) => {
              kelurahanLayer.resetStyle(e.target);
            },
          });
        },
      }).addTo(map);
      kelurahanLayerRef.current = kelurahanLayer;

      L.control.layers(null, { 'Wilayah Kelurahan': kelurahanLayer }, { collapsed: false }).addTo(map);
    }).catch(e => console.error(e));

    // Real-time socket listener
    socket.on('new_report', (report) => {
      if (!report || !report.id) return;
      console.log('Laporan baru real-time:', report.location_name);
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
