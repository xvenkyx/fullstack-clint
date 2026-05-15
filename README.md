# Full Stack Monitoring & AI Insights Dashboard

A real-time HTTP response monitoring system with automated AI-driven anomaly detection and natural language insights.

## Architecture Overview

The system is built using a modern full-stack architecture:

- **Frontend**: React (Vite) for a responsive, high-performance UI. Managed via Vanilla CSS for precise design control.
- **Backend**: Node.js and Express.js REST API.
- **Database**: MongoDB for flexible storage of unstructured monitoring data and AI insights.
- **Real-time**: Socket.io for bidirectional communication, enabling instant dashboard updates.
- **AI Engine**: Anthropic Claude 3.5 Sonnet for natural language analysis and incident reporting.

## Core Features

### 1. Real-time Monitoring
A background service pings `httpbin.org/anything` every 5 minutes. Each request includes a randomly generated JSON payload. Results are broadcasted immediately to all connected clients.

### 2. AI Enhancement (Option B)
- **Natural Language Query**: A chat interface allowing users to ask questions like "What was the average latency today?" or "Summarize recent issues."
- **Automatic Incident Reporting**: If a response time exceeds 2x the historical average, the AI analyzes the failure, identifies potential root causes, and suggests actionable recommendations.
- **Cost Optimization (Iterative Refinement)**: 
    - **Model Selection**: Switched to **Claude 4.5 Haiku** for high reasoning capability at a fraction of the cost of larger models.
    - **Context Trimming**: Reduced AI context window to the most recent 15 records (down from 50) to minimize prompt token usage.
    - **Intelligent Caching**: Implemented a 10-minute in-memory cache for duplicate queries.
    - **Token Counting**: Real-time token tracking and cost estimation displayed on the dashboard.
    - **Rate Limiting**: Hard cap of 20 AI calls per hour to prevent budget overruns.

## Technology Choices & Reasoning

- **Express & Socket.io**: Chosen for their lightweight nature and excellent support for real-time event-driven architectures.
- **MongoDB**: Ideal for storing varied HTTP response structures and AI-generated text without strict schema migrations.
- **Vanilla CSS**: Used to create a premium, bespoke aesthetic without the overhead or design constraints of a UI library.
- **Claude 3.5 Sonnet**: Selected for its superior reasoning capabilities in technical analysis and low latency compared to other high-end models.

## Setup Instructions

### Prerequisites
- Node.js (v18+)
- MongoDB (Local or Atlas)
- Claude API Key

### Backend Setup
1. `cd backend`
2. `npm install`
3. Create a `.env` file based on `.env.example`.
4. `npm start`

### Frontend Setup
1. `cd frontend`
2. `npm install`
3. `npm run dev`

## Database Schema

### Response
- `timestamp`: Date
- `method`: String
- `endpoint`: String
- `statusCode`: Number
- `responseTime`: Number
- `payload`: Object
- `responseBody`: Object

### Incident
- `timestamp`: Date
- `severity`: Enum (low, medium, high)
- `endpoint`: String
- `responseTime`: Number
- `rootCause`: String
- `recommendations`: Array

## Testing Strategy

The core component identified for testing is the **AI Incident Processor**. This component handles the critical logic of anomaly detection and prompt construction.
- **Unit Tests**: Located in `backend/src/services/ai.service.test.js`.
- **CI**: Automated via GitHub Actions on every push.

## Assumptions & Future Improvements

- **Assumptions**: Baseline latency is calculated from the last 20 requests.
- **Future Improvements**:
    - Implement persistent caching for AI responses across server restarts.
    - Add multi-endpoint support for monitoring.
    - Support for custom alert thresholds per endpoint.
