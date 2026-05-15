import { describe, test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { monitorService } from './monitor.service.js';
import { ResponseModel } from '../models/response.model.js';
import { aiService } from './ai.service.js';

// builds a list of fake response records all with the same response time
const makeRecords = (count, responseTime) =>
  Array.from({ length: count }, (_, i) => ({
    responseTime,
    statusCode: 200,
    timestamp: new Date(Date.now() - i * 5000)
  }));

describe('MonitorService.checkForAnomalies', () => {
  afterEach(() => mock.restoreAll());

  test('does nothing when there are fewer than 5 records', async () => {
    mock.method(ResponseModel, 'find', () => ({
      sort: () => ({ limit: () => Promise.resolve(makeRecords(3, 200)) })
    }));
    const reportFn = mock.method(aiService, 'generateIncidentReport', async () => {});

    await monitorService.checkForAnomalies({ responseTime: 999, endpoint: 'https://httpbin.org/anything' });

    assert.equal(reportFn.mock.calls.length, 0);
  });

  test('does not raise an incident for a normal response time', async () => {
    // avg will be 200ms, threshold is 2x = 400ms
    mock.method(ResponseModel, 'find', () => ({
      sort: () => ({ limit: () => Promise.resolve(makeRecords(10, 200)) })
    }));
    const reportFn = mock.method(aiService, 'generateIncidentReport', async () => {});

    await monitorService.checkForAnomalies({ responseTime: 350, endpoint: 'https://httpbin.org/anything' });

    assert.equal(reportFn.mock.calls.length, 0);
  });

  test('triggers an incident report when response time exceeds 2x the average', async () => {
    mock.method(ResponseModel, 'find', () => ({
      sort: () => ({ limit: () => Promise.resolve(makeRecords(10, 200)) })
    }));
    const reportFn = mock.method(aiService, 'generateIncidentReport', async () => {});

    const slowRecord = { responseTime: 600, endpoint: 'https://httpbin.org/anything', statusCode: 200 };
    await monitorService.checkForAnomalies(slowRecord);

    assert.equal(reportFn.mock.calls.length, 1);
    assert.equal(reportFn.mock.calls[0].arguments[0], slowRecord);
  });
});
