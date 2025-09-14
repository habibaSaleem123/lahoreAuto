// src/components/Header.js
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(sessionStorage.getItem('user'));

  const handleLogout = async () => {
    try {
      await axios.get('/api/logout', { withCredentials: true });
    } catch (err) {
      console.error('Logout error:', err);
    }
    sessionStorage.removeItem('user');
    navigate('/login');
  };

  if (location.pathname === '/login') return null;

  return (
    <nav
      style={{
        background: 'linear-gradient(to bottom right, #000000, #4b0000)',
        padding: '1.5rem 3rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '3px solid #800000', // maroon border
        color: '#fff',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      }}
    >
      <h1
        onClick={() => navigate('/modules')}
        style={{
          fontSize: '2.4rem',
          fontWeight: '900',
          letterSpacing: '1.5px',
          color: '#fff',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'all 0.3s ease',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.color = '#800000';
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.color = '#fff';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
         LAHORE AUTO TRADERS
      </h1>

      {user && (
        <div
          style={{
            backgroundColor: '#111', // darker black
            padding: '0.75rem 1.5rem',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            border: '1px solid #800000',
          }}
        >
          <span style={{ fontWeight: 'bold', fontSize: '1rem', color: '#fff' }}>
             Welcome, {user.username}
          </span>
          <button
            onClick={handleLogout}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#800000',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#a00000';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#800000';
            }}
          >
            Logout
          </button>
        </div>
      )}
    </nav>
  );
};

export default Header;
