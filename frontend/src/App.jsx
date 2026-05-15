import { useState } from 'react';
import Dashboard from './components/Dashboard';
import Incidents from './components/Incidents';
import ChatWidget from './components/ChatWidget';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="app">
      <div className="sidebar">
        <div style={{ fontWeight: 700, marginBottom: '2rem', fontSize: '1.2rem' }}>Monitor.io</div>
        <button 
          className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
        <button 
          className={`nav-link ${activeTab === 'incidents' ? 'active' : ''}`}
          onClick={() => setActiveTab('incidents')}
        >
          Incidents
        </button>
      </div>
      <div className="main">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'incidents' && <Incidents />}
      </div>
      <ChatWidget />
    </div>
  );
}

export default App;
