import express from 'express';
import { ResponseModel } from '../models/response.model.js';
import { IncidentModel } from '../models/incident.model.js';
import { aiService } from '../services/ai.service.js';

const router = express.Router();

router.get('/responses', async (req, res) => {
  try {
    const responses = await ResponseModel.find().sort({ timestamp: -1 }).limit(100);
    res.json(responses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/incidents', async (req, res) => {
  try {
    const incidents = await IncidentModel.find().sort({ timestamp: -1 });
    res.json(incidents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/query', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query is required' });

  try {
    const response = await aiService.queryData(query);
    res.json({ response });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const stats = await aiService.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
