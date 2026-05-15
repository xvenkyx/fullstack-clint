import axios from 'axios';
import cron from 'node-cron';
import { ResponseModel } from '../models/response.model.js';
import { aiService } from './ai.service.js';

class MonitorService {
  constructor() {
    this.io = null;
    this.isMonitoring = false;
  }

  init(io) {
    this.io = io;
    // Ping every 5 minutes
    cron.schedule('*/5 * * * *', () => {
      this.ping();
    });
    // Also ping immediately on start
    this.ping();
  }

  async ping() {
    const startTime = Date.now();
    const payload = {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toISOString(),
      metadata: { source: 'bizscout-monitor' }
    };

    try {
      const response = await axios.post('https://httpbin.org/anything', payload);
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      const record = await ResponseModel.create({
        method: 'POST',
        endpoint: 'https://httpbin.org/anything',
        statusCode: response.status,
        responseTime: responseTime,
        payload: payload,
        responseBody: response.data
      });

      if (this.io) {
        this.io.emit('new_response', record);
      }

      await this.checkForAnomalies(record);
    } catch (error) {
      console.error('Monitor ping failed:', error.message);
      // Even if it fails, we should record the failure
      const failureRecord = await ResponseModel.create({
        method: 'POST',
        endpoint: 'https://httpbin.org/anything',
        statusCode: error.response?.status || 500,
        responseTime: Date.now() - startTime,
        payload: payload,
        responseBody: { error: error.message }
      });
      
      if (this.io) {
        this.io.emit('new_response', failureRecord);
      }
    }
  }

  async checkForAnomalies(newRecord) {
    // Get average response time of last 20 requests
    const lastResponses = await ResponseModel.find()
      .sort({ timestamp: -1 })
      .limit(21); // Include the new one

    if (lastResponses.length < 5) return; // Need some baseline

    const historical = lastResponses.slice(1);
    const avg = historical.reduce((acc, curr) => acc + curr.responseTime, 0) / historical.length;

    if (newRecord.responseTime > avg * 2) {
      console.log(`Anomaly detected: ${newRecord.responseTime}ms vs avg ${avg.toFixed(2)}ms`);
      await aiService.generateIncidentReport(newRecord, avg, this.io);
    }
  }
}

export const monitorService = new MonitorService();
