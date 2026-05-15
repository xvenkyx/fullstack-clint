import { describe, test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import { ResponseModel } from '../models/response.model.js';
import { IncidentModel } from '../models/incident.model.js';
import { aiService } from '../services/ai.service.js';

describe('GET /api/responses', () => {
  afterEach(() => mock.restoreAll());

  test('returns stored responses', async () => {
    const fakeData = [
      { endpoint: 'https://httpbin.org/anything', responseTime: 142, statusCode: 200 }
    ];
    mock.method(ResponseModel, 'find', () => ({
      sort: () => ({ limit: () => Promise.resolve(fakeData) })
    }));

    const res = await request(app).get('/api/responses');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, fakeData);
  });

  test('returns 500 when the db query fails', async () => {
    mock.method(ResponseModel, 'find', () => ({
      sort: () => ({ limit: () => Promise.reject(new Error('connection refused')) })
    }));

    const res = await request(app).get('/api/responses');
    assert.equal(res.status, 500);
    assert.ok(res.body.error);
  });
});

describe('GET /api/incidents', () => {
  afterEach(() => mock.restoreAll());

  test('returns incidents sorted by time', async () => {
    const fakeIncidents = [
      { endpoint: 'https://httpbin.org/anything', severity: 'medium', rootCause: 'slow DNS' }
    ];
    mock.method(IncidentModel, 'find', () => ({
      sort: () => Promise.resolve(fakeIncidents)
    }));

    const res = await request(app).get('/api/incidents');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, fakeIncidents);
  });
});

describe('POST /api/query', () => {
  afterEach(() => mock.restoreAll());

  test('returns 400 when query field is missing', async () => {
    const res = await request(app).post('/api/query').send({});
    assert.equal(res.status, 400);
  });

  test('returns the AI response on a valid query', async () => {
    mock.method(aiService, 'queryData', async () => 'Response times look normal.');

    const res = await request(app)
      .post('/api/query')
      .send({ query: 'how is the system performing?' });

    assert.equal(res.status, 200);
    assert.equal(res.body.response, 'Response times look normal.');
  });

  test('returns 500 when the AI service throws', async () => {
    mock.method(aiService, 'queryData', async () => {
      throw new Error('Rate limit exceeded (20 AI calls/hour)');
    });

    const res = await request(app)
      .post('/api/query')
      .send({ query: 'anything' });

    assert.equal(res.status, 500);
    assert.ok(res.body.error);
  });
});

describe('GET /api/stats', () => {
  afterEach(() => mock.restoreAll());

  test('returns token usage totals', async () => {
    mock.method(aiService, 'getStats', async () => ({
      totalCost: 0.0031,
      totalTokens: 2480
    }));

    const res = await request(app).get('/api/stats');
    assert.equal(res.status, 200);
    assert.equal(res.body.totalTokens, 2480);
  });
});
