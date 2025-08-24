// src/components/ModulesPage.js
import React from 'react';
import { Link } from 'react-router-dom';
import {
  FaMotorcycle, FaBoxes, FaFileInvoice, FaUsers, FaMoneyBill,
  FaWarehouse, FaUndo, FaChartLine, FaClipboardList, FaUniversity, FaCashRegister
} from 'react-icons/fa';

const modules = [
  { name: 'New Entry', path: '/entry-form', icon: <FaMotorcycle size={30} /> },
  { name: 'GD List', path: '/gd-list', icon: <FaClipboardList size={30} /> },
  { name: 'Stock In', path: '/stock-in', icon: <FaBoxes size={30} /> },
  { name: 'Stock Summary', path: '/stock-summary', icon: <FaWarehouse size={30} /> },
  { name: 'Sales', path: '/sales', icon: <FaCashRegister size={30} /> },
  { name: 'Invoices', path: '/invoices', icon: <FaFileInvoice size={30} /> },
  { name: 'Returns', path: '/returns', icon: <FaUndo size={30} /> },
  { name: 'Customers', path: '/customers', icon: <FaUsers size={30} /> },
  { name: 'Payments', path: '/payments', icon: <FaMoneyBill size={30} /> },
  { name: 'Banks', path: '/banks', icon: <FaUniversity size={30} /> },
  { name: 'Reports', path: '/reports', icon: <FaChartLine size={30} /> },
];

const ModulesPage = () => {
  return (
    <div className="modules-page">
      <div className="overlay" />
      <h2 className="title">Choose a Module</h2>

      <div className="modules-grid">
        {modules.map((mod) => (
          <Link
            to={mod.path}
            key={mod.name}
            className="module-card"
          >
            <div className="icon">{mod.icon}</div>
            {mod.name}
          </Link>
        ))}
      </div>

      {/* Styles */}
      <style>
        {`
          .modules-page {
            position: relative;
            min-height: 100vh;
            padding: 2rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            color: #fff;
            background: #0d0d0d;
            overflow: hidden;
          }

          /* Moving background pattern */
          .modules-page::before {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            width: 300%;
            height: 300%;
            background-image: 
              repeating-linear-gradient(
                120deg,
                rgba(255, 76, 76, 0.05) 0px,
                rgba(255, 76, 76, 0.05) 2px,
                transparent 2px,
                transparent 20px
              );
            animation: moveBackground 15s linear infinite;
            z-index: 0;
          }

          @keyframes moveBackground {
            0% { transform: translate(0, 0); }
            100% { transform: translate(-20%, -20%); }
          }

          .overlay {
            position: absolute;
            inset: 0;
            background: radial-gradient(circle at top left, rgba(255, 76, 76, 0.08), transparent 70%);
            z-index: 1;
          }

          .title {
            font-size: 2.5rem;
            margin-bottom: 2rem;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 2px;
            color: #ff4c4c;
            text-shadow: 0 2px 10px rgba(255, 76, 76, 0.5);
            z-index: 2;
          }

          .modules-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 2rem;
            width: 100%;
            max-width: 1200px;
            z-index: 2;
          }

          .module-card {
            text-decoration: none;
            color: #fff;
            padding: 2rem;
            border-radius: 15px;
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 76, 76, 0.3);
            box-shadow: 0 8px 20px rgba(255, 76, 76, 0.1);
            text-align: center;
            font-size: 1.2rem;
            font-weight: 600;
            letter-spacing: 1px;
            transition: all 0.3s ease-in-out;
          }

          .module-card:hover {
            transform: scale(1.05);
            box-shadow: 0 12px 25px rgba(255, 76, 76, 0.4);
            background: rgba(255, 76, 76, 0.15);
          }

          .icon {
            margin-bottom: 1rem;
          }

          @media (max-width: 576px) {
            .title {
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
