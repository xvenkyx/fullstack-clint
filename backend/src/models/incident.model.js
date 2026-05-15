import mongoose from 'mongoose';

const incidentSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  endpoint: String,
  responseTime: Number,
  averageResponseTime: Number,
  rootCause: String,
  recommendations: [String],
  isResolved: { type: Boolean, default: false }
});

export const IncidentModel = mongoose.model('Incident', incidentSchema);
