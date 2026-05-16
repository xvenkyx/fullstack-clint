import { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';

const API_BASE = `${import.meta.env.VITE_API_URL}/api`;
const socket = io(import.meta.env.VITE_API_URL);

const Incidents = () => {
  const [incidents, setIncidents] = useState([]);

  useEffect(() => {
    axios.get(`${API_BASE}/incidents`).then(res => setIncidents(res.data)).catch(() => {});
    socket.on('new_incident', (data) => {
      setIncidents((prev) => [data, ...prev]);
    });
    return () => socket.off('new_incident');
  }, []);

  return (
    <div className="incidents">
      <div className="header">
        <h1>Incident Log</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Automated detection history</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {incidents.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
            No incidents detected.
          </div>
        ) : (
          incidents.map((incident) => (
            <div key={incident._id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <span style={{ fontWeight: 600 }}>Spike Detected: {incident.responseTime}ms</span>
                <span className="badge">{new Date(incident.timestamp).toLocaleString()}</span>
              </div>
              <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '6px', marginBottom: '1rem' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>ROOT CAUSE</div>
                <p style={{ fontSize: '13px' }}>{incident.rootCause}</p>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>ACTIONS</div>
                <ul style={{ paddingLeft: '1.2rem', fontSize: '13px' }}>
                  {incident.recommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Incidents;
