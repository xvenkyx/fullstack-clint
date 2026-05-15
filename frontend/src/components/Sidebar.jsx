
import { LayoutDashboard, AlertCircle, BarChart3, Settings } from 'lucide-react';

const Sidebar = ({ activeTab, setActiveTab }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'incidents', label: 'Incidents', icon: AlertCircle },
  ];

  return (
    <aside className="sidebar">
      <div className="logo">BIZSCOUT</div>
      <nav className="nav-links">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
              style={{ background: 'none', border: 'none', textAlign: 'left', width: '100%', font: 'inherit' }}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div style={{ marginTop: 'auto' }} className="nav-links">
        <div className="nav-item">
          <BarChart3 size={20} />
          <span>Analytics</span>
        </div>
        <div className="nav-item">
          <Settings size={20} />
          <span>Settings</span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
