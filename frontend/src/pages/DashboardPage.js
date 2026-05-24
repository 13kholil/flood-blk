import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Badge, Spinner } from 'react-bootstrap';
import { getCurrentWeather, getWeatherForecast, weatherCodeToLabel, isRainyWeather } from '../services/bmkg';
import axios from 'axios';

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:4000';

function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [weather, setWeather] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      axios.get(BASE + '/api/reports/stats').then(r => r.data),
      getCurrentWeather(),
      getWeatherForecast(),
    ]).then(([s, w, f]) => { setStats(s); setWeather(w); setForecast(f); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="primary" /><p className="mt-2 text-muted">Memuat data...</p></div>;

  return (
    <div className="p-3">
      {weather && (
        <Card className="mb-3 shadow-sm border-primary">
          <Card.Body className="p-3">
            <div className="d-flex justify-content-between align-items-start mb-2">
              <div><h6 className="fw-bold mb-0">🌤 Cuaca BMKG</h6><small className="text-muted">Kel. Terang-Terang, Ujung Bulu</small></div>
              <Badge bg={isRainyWeather(weather.current?.weather_code) ? 'danger' : 'success'} className="fs-6">{weatherCodeToLabel(weather.current?.weather_code)}</Badge>
            </div>
            <Row className="g-2 text-center">
              <Col xs={4}><div className="bg-light rounded py-2"><div className="fs-4 fw-bold text-primary">{weather.current?.temperature_c || '?'}°C</div><small className="text-muted">Suhu</small></div></Col>
              <Col xs={4}><div className="bg-light rounded py-2"><div className="fs-4 fw-bold text-info">{weather.current?.humidity_pct || '?'}%</div><small className="text-muted">Kelembaban</small></div></Col>
              <Col xs={4}><div className="bg-light rounded py-2"><div className="fs-4 fw-bold text-secondary">{weather.current?.wind_speed_kmh || '?'}</div><small className="text-muted">Angin km/h</small></div></Col>
            </Row>
          </Card.Body>
        </Card>
      )}
      {forecast?.forecast && (
        <Card className="mb-3 shadow-sm">
          <Card.Body className="p-3">
            <h6 className="fw-bold mb-2">📅 Prakiraan 3 Hari</h6>
            <div className="d-flex gap-2 overflow-auto">
              {forecast.forecast.map((day, i) => (
                <div key={i} className="bg-light rounded p-2 text-center flex-shrink-0" style={{ minWidth: 100 }}>
                  <small className="text-muted d-block">{new Date(day.date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' })}</small>
                  <div className="fs-5 fw-bold my-1">{day.entries[0]?.temperature_c || '?'}°</div>
                  <Badge bg={isRainyWeather(day.entries[0]?.weather_code) ? 'danger' : 'secondary'} className="small">{weatherCodeToLabel(day.entries[0]?.weather_code)}</Badge>
                </div>
              ))}
            </div>
          </Card.Body>
        </Card>
      )}
      {stats && (
        <>
          <Row className="g-2 mb-3">
            <Col xs={6}><Card bg="primary" text="white" className="shadow-sm"><Card.Body className="text-center py-3"><div className="fs-3 mb-1">📋</div><div className="fs-4 fw-bold">{stats.total}</div><div className="small opacity-75">Total Laporan</div></Card.Body></Card></Col>
            <Col xs={6}><Card bg="success" text="white" className="shadow-sm"><Card.Body className="text-center py-3"><div className="fs-3 mb-1">📅</div><div className="fs-4 fw-bold">{stats.today}</div><div className="small opacity-75">Hari Ini</div></Card.Body></Card></Col>
            <Col xs={6}><Card bg="warning" text="dark" className="shadow-sm"><Card.Body className="text-center py-3"><div className="fs-3 mb-1">✅</div><div className="fs-4 fw-bold">{stats.verified}</div><div className="small opacity-75">Terverifikasi</div></Card.Body></Card></Col>
            <Col xs={6}><Card bg="info" text="dark" className="shadow-sm"><Card.Body className="text-center py-3"><div className="fs-3 mb-1">💧</div><div className="fs-4 fw-bold">{stats.avgDepth} cm</div><div className="small opacity-75">Rata-rata Kedalaman</div></Card.Body></Card></Col>
          </Row>
          <Card className="mb-3 shadow-sm"><Card.Body><h6 className="fw-semibold mb-3">📌 Laporan Terbaru</h6>
            {stats.recent.map(r => (
              <div key={r.id} className="d-flex justify-content-between align-items-center py-2 border-bottom border-light">
                <div className="small"><div className="fw-semibold">{r.location_name || 'Tanpa lokasi'}</div><small className="text-muted">{new Date(r.created_at).toLocaleString('id-ID')}</small></div>
                <Badge bg="info" className="fs-6">{r.water_depth || '?'} cm</Badge>
              </div>
            ))}
          </Card.Body></Card>
        </>
      )}
    </div>
  );
}

export default DashboardPage;
