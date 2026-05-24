import React, { useState } from 'react';
import Navbar from './components/Navbar';
import BottomNav from './components/BottomNav';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import ReportsPage from './pages/ReportsPage';
import EmergencyPage from './pages/EmergencyPage';

const PAGES = { HOME: 'home', DASHBOARD: 'dashboard', REPORTS: 'reports', EMERGENCY: 'emergency' };

function App() {
  const [page, setPage] = useState(PAGES.HOME);
  const [refreshKey, setRefreshKey] = useState(0);

  const navigate = (p) => { setPage(p); setRefreshKey(k => k + 1); };

  const renderPage = () => {
    switch (page) {
      case PAGES.DASHBOARD: return <DashboardPage key={refreshKey} />;
      case PAGES.REPORTS: return <ReportsPage key={refreshKey} />;
      case PAGES.EMERGENCY: return <EmergencyPage key={refreshKey} />;
      default: return <HomePage key={refreshKey} />;
    }
  };

  const titles = {
    [PAGES.HOME]: 'Siaga Bulukumba',
    [PAGES.DASHBOARD]: 'Dashboard',
    [PAGES.REPORTS]: 'Laporan Banjir',
    [PAGES.EMERGENCY]: 'Kontak Darurat',
  };

  return (
    <div className="d-flex flex-column vh-100 bg-light">
      <Navbar title={titles[page]} onNavigate={navigate} homePage={PAGES.HOME} />
      <main className="flex-grow-1 overflow-auto" style={{ paddingBottom: '64px' }}>
        {renderPage()}
      </main>
      <BottomNav current={page} onNavigate={navigate} />
    </div>
  );
}

export default App;
