/**
 * Tests for the Siaga Bulukumba backend API.
 * Runs with: NODE_ENV=test npx jest --forceExit
 */

process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.ADMIN_API_KEY = 'test-admin-key-123';

const request = require('supertest');
const path = require('path');
const fs = require('fs');

// We need to set up the app without actually listening
let app, server;

beforeAll(() => {
  // Clear any pre-existing db
  const { initDB } = require('../models/Report');
  initDB();

  const expressApp = require('../server');
  app = expressApp.app;
  server = expressApp.server;
});

afterAll(() => {
  if (server) server.close();
});

// ─── Health Check ───

describe('GET /api/health', () => {
  it('should return status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('timestamp');
  });
});

// ─── Reports CRUD ───

describe('GET /api/reports', () => {
  it('should return paginated reports', async () => {
    const res = await request(app).get('/api/reports');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('rows');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('pages');
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('should respect page and limit params', async () => {
    const res = await request(app).get('/api/reports?page=1&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeLessThanOrEqual(5);
    expect(res.body.limit).toBe(5);
  });

  it('should filter by verified status', async () => {
    const res = await request(app).get('/api/reports?verified=1');
    expect(res.status).toBe(200);
    res.body.rows.forEach(r => {
      expect(r.verified).toBe(1);
    });
  });

  it('should filter by search query', async () => {
    const res = await request(app).get('/api/reports?search=Sam');
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeGreaterThan(0);
  });
});

describe('GET /api/reports/stats', () => {
  it('should return aggregate statistics', async () => {
    const res = await request(app).get('/api/reports/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('verified');
    expect(res.body).toHaveProperty('avgDepth');
    expect(res.body).toHaveProperty('maxDepth');
    expect(res.body).toHaveProperty('today');
    expect(res.body).toHaveProperty('byLocation');
  });
});

describe('GET /api/reports/:id', () => {
  it('should return a single report by ID', async () => {
    const res = await request(app).get('/api/reports/1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 1);
    expect(res.body).toHaveProperty('latitude');
    expect(res.body).toHaveProperty('longitude');
    expect(res.body).toHaveProperty('water_depth');
  });

  it('should return 404 for non-existent ID', async () => {
    const res = await request(app).get('/api/reports/99999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('should return 400 for invalid ID', async () => {
    const res = await request(app).get('/api/reports/abc');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('GET /api/reports/nearby', () => {
  it('should find nearby reports', async () => {
    const res = await request(app).get('/api/reports/nearby?lat=-5.540&lng=120.193&radius=200');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should return 400 without lat/lng', async () => {
    const res = await request(app).get('/api/reports/nearby');
    expect(res.status).toBe(400);
  });
});

// ─── Admin Endpoints ───

describe('PATCH /api/reports/:id/verify (admin)', () => {
  it('should verify a report with valid admin key', async () => {
    const res = await request(app)
      .patch('/api/reports/1/verify')
      .set('X-API-Key', 'test-admin-key-123')
      .send({ verified: true });
    expect(res.status).toBe(200);
    expect(res.body.report.verified).toBe(1);
  });

  it('should reject without admin key', async () => {
    const res = await request(app)
      .patch('/api/reports/1/verify')
      .send({ verified: false });
    expect(res.status).toBe(401);
  });

  it('should unverify a report', async () => {
    const res = await request(app)
      .patch('/api/reports/1/verify')
      .set('X-API-Key', 'test-admin-key-123')
      .send({ verified: false });
    expect(res.status).toBe(200);
    expect(res.body.report.verified).toBe(0);
  });
});

describe('DELETE /api/reports/:id (admin)', () => {
  it('should reject without admin key', async () => {
    const res = await request(app).delete('/api/reports/1');
    expect(res.status).toBe(401);
  });
});

// ─── Bounding Box ───

describe('GET /api/reports/bbox', () => {
  it('should return reports within bounding box', async () => {
    const res = await request(app)
      .get('/api/reports/bbox')
      .query({ south: -5.6, west: 120.15, north: -5.5, east: 120.25 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should return 400 without bbox params', async () => {
    const res = await request(app).get('/api/reports/bbox');
    expect(res.status).toBe(400);
  });
});
