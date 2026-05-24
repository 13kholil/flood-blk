import React from 'react';
import { Card, Badge } from 'react-bootstrap';

const contacts = [
  { name: 'BPBD Bulukumba', phone: '(0413) 81234', icon: '🏢', desc: 'Badan Penanggulangan Bencana Daerah' },
  { name: 'RSUD Bulukumba', phone: '(0413) 81118', icon: '🏥', desc: 'Rumah Sakit Umum Daerah' },
  { name: 'Polres Bulukumba', phone: '110', icon: '👮', desc: 'Kepolisian Resor Bulukumba' },
  { name: 'Damkar Bulukumba', phone: '113', icon: '🚒', desc: 'Pemadam Kebakaran' },
  { name: 'PLN Bulukumba', phone: '123', icon: '⚡', desc: 'Listrik Nasional' },
  { name: 'Call Center Darurat', phone: '112', icon: '🆘', desc: 'Nomor darurat nasional' },
];

const tips = [
  'Segera matikan listrik jika air mulai masuk rumah',
  'Dokumen penting disimpan di tempat aman & tinggi',
  'Siapkan tas siaga bencana (obat, senter, makanan)',
  'Jangan berenang di banjir — risiko tersengat listrik',
  'Evakuasi ke tempat lebih tinggi jika air naik',
  'Ikuti arahan petugas BPBD setempat',
];

function EmergencyPage() {
  return (
    <div className="p-3">
      <Card className="mb-3 shadow-sm border-danger">
        <Card.Body className="p-3">
          <h6 className="fw-bold text-danger mb-2">🆘 Kontak Darurat Bulukumba</h6>
          <div className="d-flex flex-column gap-2">
            {contacts.map((c, i) => (
              <div key={i} className="d-flex align-items-center gap-3 bg-light rounded p-2">
                <span className="fs-3">{c.icon}</span>
                <div className="flex-grow-1">
                  <div className="fw-semibold small">{c.name}</div>
                  <small className="text-muted">{c.desc}</small>
                </div>
                <a href={`tel:${c.phone.replace(/[^0-9]/g, '')}`} className="btn btn-danger btn-sm fw-bold px-3">{c.phone}</a>
              </div>
            ))}
          </div>
        </Card.Body>
      </Card>

      <Card className="shadow-sm">
        <Card.Body className="p-3">
          <h6 className="fw-bold mb-2">💡 Tips Saat Banjir</h6>
          <div className="d-flex flex-column gap-2">
            {tips.map((t, i) => (
              <div key={i} className="d-flex align-items-start gap-2">
                <Badge bg="info" className="mt-1">{i + 1}</Badge>
                <small>{t}</small>
              </div>
            ))}
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}

export default EmergencyPage;
