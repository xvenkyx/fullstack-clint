import Anthropic from '@anthropic-ai/sdk';
import { encode } from 'gpt-tokenizer';
import { TokenUsageModel } from '../models/tokenUsage.model.js';
import { IncidentModel } from '../models/incident.model.js';
import { ResponseModel } from '../models/response.model.js';
import dotenv from 'dotenv';

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// Simple Rate Limiter (20 calls/hour)
const RATE_LIMIT = 20;
const rateLimitWindow = 60 * 60 * 1000; // 1 hour
let callHistory = [];

// Simple Cache
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

class AIService {
  constructor() {
    this.pricing = {
      prompt: 0.00025 / 1000, // Haiku 4.5 pricing guess
      completion: 0.00125 / 1000
    };
  }

  async generateIncidentReport(record, averageTime, io) {
    if (!this.checkRateLimit()) return;

    const prompt = `Anomaly detected in HTTP monitor. 
    Current response time: ${record.responseTime}ms
    Average response time: ${averageTime.toFixed(2)}ms
    Endpoint: ${record.endpoint}
    Status Code: ${record.statusCode}
    Payload: ${JSON.stringify(record.payload)}
    
    Please provide:
    1. Potential root causes
    2. Actionable recommendations
    
    IMPORTANT: Provide ONLY a raw JSON object. Do not include markdown formatting or explanation.
    Format: { "rootCause": "string", "recommendations": ["string"] }`;

    try {
      const response = await this.callLLM(prompt, 'incident_report');
      let text = response.content[0].text;
      
      // Strip markdown code blocks if present
      text = text.replace(/```json\n?|```/g, '').trim();
      
      const data = JSON.parse(text);

      const incident = await IncidentModel.create({
        endpoint: record.endpoint,
        responseTime: record.responseTime,
        averageResponseTime: averageTime,
        rootCause: data.rootCause,
        recommendations: data.recommendations,
        severity: record.responseTime > averageTime * 5 ? 'high' : 'medium'
      });

      if (io) {
        io.emit('new_incident', incident);
      }
      return incident;
    } catch (error) {
      console.error('AI Incident Report failed:', error.message);
    }
  }

  async queryData(userQuery) {
    try {
      // Check Cache
      if (cache.has(userQuery)) {
        const cached = cache.get(userQuery);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
          return cached.result;
        }
      }

      if (!this.checkRateLimit()) {
        throw new Error('Rate limit exceeded (20 AI calls/hour)');
      }

      // Fetch context (reduced to last 15 for cost optimization)
      const recentResponses = await ResponseModel.find().sort({ timestamp: -1 }).limit(15);
      const stats = await this.getStats();
      const callsUsed = callHistory.length;

      const prompt = `You are a monitoring assistant for an HTTP monitoring system.
      Recent requests (last 15): ${JSON.stringify(recentResponses.map(r => ({
        time: r.timestamp,
        responseTime: r.responseTime,
        statusCode: r.statusCode,
        payload: r.payload,
        responseBody: r.responseBody ? { method: r.responseBody.method, json: r.responseBody.json } : null
      })))}
      AI Usage: Cost $${stats.totalCost.toFixed(4)}, Tokens: ${stats.totalTokens}, Calls this hour: ${callsUsed}/20.

      User Query: "${userQuery}"

      Answer concisely based on the data above. If you can't answer from what's available, say so.`;

      const response = await this.callLLM(prompt, 'natural_language_query');
      const result = response.content[0].text;

      // Save to Cache
      cache.set(userQuery, { result, timestamp: Date.now() });

      return result;
    } catch (error) {
      console.error('AI Query Error:', error.message);
      throw error;
    }
  }

  async callLLM(prompt, action) {
    const promptTokens = encode(prompt).length;
    
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const completionTokens = encode(message.content[0].text).length;
    const totalTokens = promptTokens + completionTokens;
    const estimatedCost = (promptTokens * this.pricing.prompt) + (completionTokens * this.pricing.completion);

    await TokenUsageModel.create({
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCost,
      action
    });

    return message;
  }

  checkRateLimit() {
    const now = Date.now();
    callHistory = callHistory.filter(t => now - t < rateLimitWindow);
    if (callHistory.length >= RATE_LIMIT) return false;
    callHistory.push(now);
    return true;
  }

  async getStats() {
    const totalUsage = await TokenUsageModel.aggregate([
      { $group: { _id: null, totalCost: { $sum: "$estimatedCost" }, totalTokens: { $sum: "$totalTokens" } } }
    ]);
    return totalUsage[0] || { totalCost: 0, totalTokens: 0 };
  }
}

export const aiService = new AIService();
