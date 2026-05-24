import React from 'react';
import { Navbar as BsNavbar, Container } from 'react-bootstrap';

function Navbar({ title, onNavigate, homePage }) {
  return (
    <BsNavbar bg="primary" variant="dark" className="shadow-sm" style={{ minHeight: 52 }}>
      <Container fluid>
        <BsNavbar.Brand onClick={() => onNavigate(homePage)} className="d-flex align-items-center gap-2" style={{ cursor: 'pointer' }}>
          <span className="fw-semibold fs-6">{title}</span>
        </BsNavbar.Brand>
      </Container>
    </BsNavbar>
  );
}

export default Navbar;
