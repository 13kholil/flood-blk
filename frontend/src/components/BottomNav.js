import React from 'react';
import { Nav } from 'react-bootstrap';

const tabs = [
  { key: 'home', label: 'Peta', icon: '🗺️' },
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'reports', label: 'Laporan', icon: '📋' },
  { key: 'emergency', label: 'Darurat', icon: '🆘' },
];

function BottomNav({ current, onNavigate }) {
  return (
    <Nav className="fixed-bottom bg-white border-top justify-content-around py-1" style={{ paddingBottom: 'env(safe-area-inset-bottom, 4px)' }}>
      {tabs.map(tab => {
        const active = current === tab.key;
        return (
          <Nav.Item key={tab.key}>
            <Nav.Link
              onClick={() => onNavigate(tab.key)}
              className={`d-flex flex-column align-items-center px-3 py-1 ${active ? 'text-primary fw-bold' : 'text-secondary'}`}
              style={{ fontSize: 11 }}
            >
              <span style={{ fontSize: 20 }}>{tab.icon}</span>
              <span className="mt-1">{tab.label}</span>
            </Nav.Link>
          </Nav.Item>
        );
      })}
    </Nav>
  );
}

export default BottomNav;
