import mongoose from 'mongoose';

const tokenUsageSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  promptTokens: Number,
  completionTokens: Number,
  totalTokens: Number,
  estimatedCost: Number, // In USD
  action: String // e.g., 'natural_language_query', 'incident_report'
});

export const TokenUsageModel = mongoose.model('TokenUsage', tokenUsageSchema);
