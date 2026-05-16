import { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';

const API_BASE = `${import.meta.env.VITE_API_URL}/api`;
const socket = io(import.meta.env.VITE_API_URL);

const Dashboard = () => {
  const [responses, setResponses] = useState([]);
  const [stats, setStats] = useState({ totalCost: 0, totalTokens: 0 });

  useEffect(() => {
    axios.get(`${API_BASE}/responses`).then(res => setResponses(res.data)).catch(() => {});
    axios.get(`${API_BASE}/stats`).then(res => setStats(res.data)).catch(() => {});
    socket.on('new_response', (data) => {
      setResponses((prev) => [data, ...prev].slice(0, 100));
    });
    return () => socket.off('new_response');
  }, []);

  const avgLatency = responses.length > 0 
    ? (responses.reduce((acc, r) => acc + r.responseTime, 0) / responses.length).toFixed(0)
    : 0;

  return (
    <div className="dashboard">
      <div className="header">
        <h1>Monitoring Dashboard</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Status: System Online</p>
      </div>

      <div className="grid">
        <div className="card">
          <div className="card-label">Total Requests</div>
          <div className="card-value">{responses.length}</div>
        </div>
        <div className="card">
          <div className="card-label">Avg Latency</div>
          <div className="card-value">{avgLatency}ms</div>
        </div>
        <div className="card">
          <div className="card-label">AI Costs</div>
          <div className="card-value">${stats.totalCost.toFixed(4)}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Endpoint</th>
              <th>Status</th>
              <th>Latency</th>
            </tr>
          </thead>
          <tbody>
            {responses.map((res) => (
              <tr key={res._id || res.timestamp}>
                <td style={{ color: 'var(--text-secondary)' }}>{new Date(res.timestamp).toLocaleTimeString()}</td>
                <td>{res.endpoint.replace('https://', '')}</td>
                <td>
                  <span className={`badge ${res.statusCode < 400 ? 'badge-success' : 'badge-error'}`}>
                    {res.statusCode}
                  </span>
                </td>
                <td>{res.responseTime}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Dashboard;
