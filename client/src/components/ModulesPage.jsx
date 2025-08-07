// src/components/ModulesPage.js
import React from 'react';
import { Link } from 'react-router-dom';

const modules = [
  { name: 'New Entry', path: '/entry-form' },
  { name: 'GD List', path: '/gd-list' },
  { name: 'Stock In', path: '/stock-in' },
  { name: 'Stock Summary', path: '/stock-summary' },
  { name: 'Sales', path: '/sales' },
  { name: 'Invoices', path: '/invoices' },
  { name: 'Returns', path: '/returns' },
  { name: 'Customers', path: '/customers' },
  { name: 'Payments', path: '/payments' },
  { name: 'Banks', path: '/banks' },
  { name: 'Reports', path: '/reports' },
];

const ModulesPage = () => {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(to bottom right,rgb(242, 242, 242),rgb(111, 64, 64))',
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        color: '#fff',
      }}
    >
      <h2
        style={{
          fontSize: '2.5rem',
          marginBottom: '2rem',
          fontWeight: 'bold',
          borderBottom: '2px solid #800000',
          paddingBottom: '0.5rem',
        }}
      >
         Choose a Module
      </h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '2rem',
          width: '100%',
          maxWidth: '1200px',
        }}
      >
        {modules.map((mod) => (
          <Link
            to={mod.path}
            key={mod.name}
            style={{
              textDecoration: 'none',
              color: 'black',
              padding: '2rem',
              borderRadius: '20px',
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
              textAlign: 'center',
              fontSize: '1.2rem',
              fontWeight: '600',
              letterSpacing: '1px',
              transition: 'all 0.3s ease-in-out',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-8px)';
              e.currentTarget.style.background = 'rgba(147, 46, 46, 0.8)';
              e.currentTarget.style.boxShadow = '0 15px 40px rgba(128, 0, 0, 0.5)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.5)';
            }}
          >
            {mod.name}
          </Link>
        ))}
      </div>

      {/* Responsive styles */}
      <style>
        {`
          @media (max-width: 576px) {
            h2 {
              font-size: 1.8rem !important;
              text-align: center;
            }
          }
        `}
      </style>
    </div>
  );
};

export default ModulesPage;
