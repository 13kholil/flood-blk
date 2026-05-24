import React, { useState } from 'react';
import MapView from '../components/MapView';
import ReportForm from '../components/ReportForm';

function HomePage() {
  const [showForm, setShowForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="position-relative h-100">
      <MapView key={refreshKey} />
      <button className="btn btn-danger rounded-circle shadow position-fixed d-flex align-items-center justify-content-center"
        onClick={() => setShowForm(true)}
        style={{ width: 58, height: 58, bottom: 80, right: 20, zIndex: 100, fontSize: 28, fontWeight: 'bold' }} title="Laporkan Banjir">+</button>
      {showForm && <ReportForm onClose={() => setShowForm(false)} onSubmitSuccess={() => setRefreshKey(k => k + 1)} />}
    </div>
  );
}

export default HomePage;
