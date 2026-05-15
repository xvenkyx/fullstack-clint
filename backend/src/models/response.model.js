import mongoose from 'mongoose';

const responseSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  method: String,
  endpoint: String,
  statusCode: Number,
  responseTime: Number,
  payload: mongoose.Schema.Types.Mixed,
  responseBody: mongoose.Schema.Types.Mixed,
  tags: [String]
});

export const ResponseModel = mongoose.model('Response', responseSchema);
