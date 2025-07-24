// src/components/Header.jsx
import React from 'react';
import { Link } from 'react-router-dom';

const Header = () => {
  return (
    <nav className="header">
      <h2 className="logo">GD Management</h2>
      <div className="nav-links">
      
        <Link to="/entry-form" className="nav-link">New Entry</Link>
        <Link to="/gd-list" className="nav-link">GD List</Link>
        <Link to="/stock-in" className="nav-link">StockIn</Link>
        <Link to="/stock-summary" className="nav-link">StockSUMMARY</Link>
        <Link to="/sales" className="nav-link">Sales </Link> {/* ✅ Add */}
        <Link to="/invoices" className="nav-link">Invoices</Link> {/* ✅ Add */}
        <Link to="/returns" className="nav-link">Returns</Link> {/* ✅ Add */}
        
     
      </div>
    </nav>
  );
};

export default Header;
