// src/pages/StockSummaryPage.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  FaWarehouse,
  FaSyncAlt,
  FaSearch,
  FaLayerGroup,
  FaListUl
} from 'react-icons/fa';

const StockSummaryPage = () => {
  const [inventory, setInventory] = useState([]);
  const [viewMode, setViewMode] = useState('batch'); // 'batch' or 'grouped'
  const [reloadToggle, setReloadToggle] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const endpoint =
      viewMode === 'batch'
        ? '/api/stock/summary'
        : '/api/stock/summary-with-audit';

    setLoading(true);
    axios
      .get(endpoint)
      .then((res) => setInventory(res.data || []))
      .catch((err) => {
        console.error('Error fetching stock summary:', err);
        setInventory([]);
      })
      .finally(() => setLoading(false));
  }, [viewMode, reloadToggle]);

  const filteredInventory = inventory.filter((item) => {
    const search = (searchTerm || '').toLowerCase();

    if (viewMode === 'grouped') {
      return (
        item.description?.toLowerCase().includes(search) ||
        item.hs_codes?.toLowerCase?.().includes(search)
      );
    } else {
      return (
        item.description?.toLowerCase().includes(search) ||
        item.gd_number?.toLowerCase?.().includes(search) ||
        item.stocked_by?.toLowerCase?.().includes(search) ||
        item.unit?.toLowerCase?.().includes(search)
      );
    }
  });

  const columns =
    viewMode === 'batch'
      ? [
          'Description',
          'GD Number',
          'Quantity Remaining',
          'Unit',
          'Cost',
          'MRP',
          'Stocked At',
          'Stocked By',
        ]
      : [
          'Description',
          'Total Quantity',
          'Unit',
          'HS Codes',
          'GDs Count',
          'Last Updated',
        ];

  return (
    <div className="stock-summary-page">
      <div className="overlay" />

      {/* Header */}
      <header className="header">
        <div className="title-wrap">
          <FaWarehouse size={28} className="title-icon" />
          <h2 className="title">
            {viewMode === 'batch' ? 'Inventory Summary' : 'Grouped Stock Summary'}
          </h2>
          <span className="title-accent">
            {viewMode === 'batch' ? 'By GD Batch' : 'By Description + Unit'}
          </span>
        </div>

        <div className="controls">
          <div className="select-wrap">
            <span className="select-icon">
              {viewMode === 'batch' ? <FaListUl /> : <FaLayerGroup />}
            </span>
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value)}
              aria-label="Change view mode"
            >
              <option value="batch">View by GD Batch</option>
              <option value="grouped">Grouped by Item</option>
            </select>
          </div>

          <div className="search-wrap">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search: Description, HS Code, GD No., Stocked By, Unit"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button
            className="btn refresh"
            onClick={() => setReloadToggle((r) => !r)}
            title="Refresh Stock"
          >
            <FaSyncAlt />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* Table Card */}
      <section className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="empty">
                    Loading stock…
                  </td>
                </tr>
              ) : filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="empty">
                    No inventory records available.
                  </td>
                </tr>
              ) : (
                filteredInventory.map((item, i) => {
                  const qty =
                    viewMode === 'batch'
                      ? Number(item.quantity_remaining || 0)
                      : Number(item.quantity || 0);
                  const lowStock = qty < 40;

                  return (
                    <React.Fragment key={`${viewMode}-${i}`}>
                      <tr className={lowStock ? 'low-stock' : ''}>
                        {viewMode === 'batch' ? (
                          <>
                            <td>{item.description}</td>
                            <td>{item.gd_number}</td>
                            <td>{qty}</td>
                            <td>{item.unit}</td>
                            <td>Rs {Number(item.cost ?? 0).toFixed(2)}</td>
                            <td>Rs {Number(item.mrp ?? 0).toFixed(2)}</td>
                            <td>
                              {item.stocked_at
                                ? new Date(item.stocked_at).toLocaleString()
                                : 'N/A'}
                            </td>
                            <td>{item.stocked_by || 'N/A'}</td>
                          </>
                        ) : (
                          <>
                            <td>{item.description}</td>
                            <td>{qty}</td>
                            <td>{item.unit}</td>
                            <td>{item.hs_codes || '-'}</td>
                            <td>{item.gd_count || '-'}</td>
                            <td>
                              {item.last_updated
                                ? new Date(item.last_updated).toLocaleString()
                                : 'N/A'}
                            </td>
                          </>
                        )}
                      </tr>

                      {viewMode === 'grouped' && item.audit_log?.length > 0 && (
                        <tr>
                          <td colSpan={6} className="audit">
                            <details>
                              <summary>GD-wise Stock-In History</summary>
                              <ul>
                                {item.audit_log.map((log, idx) => (
                                  <li key={idx}>
                                    <span className="mono">{log.quantity}</span> units from{' '}
                                    <span className="mono">
                                      GD #{log.gd_number || 'N/A'}
                                    </span>{' '}
                                    {log.stocked_by && (
                                      <>by <strong>{log.stocked_by}</strong>{' '}</>
                                    )}
                                    {log.timestamp &&
                                      `on ${new Date(log.timestamp).toLocaleDateString()}`}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Styles */}
      <style>
        {`
          .stock-summary-page {
            position: relative;
            min-height: 100vh;
            padding: 2rem;
            color: #fff;
            background: #0d0d0d;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            gap: 1.25rem;
          }

          /* Animated diagonal grid like your Modules page */
          .stock-summary-page::before {
            content: "";
            position: absolute;
            top: 0; left: 0;
            width: 300%; height: 300%;
            background-image:
              repeating-linear-gradient(
                120deg,
                rgba(255, 76, 76, 0.05) 0px,
                rgba(255, 76, 76, 0.05) 2px,
                transparent 2px,
                transparent 20px
              );
            animation: moveBg 15s linear infinite;
            z-index: 0;
          }
          @keyframes moveBg {
            0% { transform: translate(0, 0); }
            100% { transform: translate(-20%, -20%); }
          }

          .overlay {
            position: absolute;
            inset: 0;
            background: radial-gradient(circle at top left, rgba(255, 76, 76, 0.08), transparent 70%);
            z-index: 1;
          }

          .header {
            z-index: 2;
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 1rem;
            align-items: center;
          }

          .title-wrap {
            display: flex;
            align-items: baseline;
            gap: .75rem;
          }
          .title-icon {
            color: #ff4c4c;
            filter: drop-shadow(0 2px 10px rgba(255, 76, 76, 0.5));
          }
          .title {
            font-size: 2rem;
            margin: 0;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: #ff4c4c;
            text-shadow: 0 2px 10px rgba(255, 76, 76, 0.5);
          }
          .title-accent {
            border: 1px solid rgba(255, 76, 76, 0.35);
            padding: .15rem .5rem;
            border-radius: 999px;
            font-size: .85rem;
            background: rgba(255,255,255,0.04);
            backdrop-filter: blur(8px);
          }

          .controls {
            display: flex;
            flex-wrap: wrap;
            gap: .75rem;
            justify-content: flex-end;
          }

          .select-wrap, .search-wrap {
            position: relative;
            display: flex;
            align-items: center;
            gap: .5rem;
            padding: .6rem .8rem;
            border-radius: 12px;
            border: 1px solid rgba(255, 76, 76, 0.3);
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(12px);
            box-shadow: 0 8px 20px rgba(255, 76, 76, 0.1);
          }
          .select-wrap select, .search-wrap input {
            appearance: none;
            background: transparent;
            border: none;
            outline: none;
            color: #fff;
            font-size: .95rem;
            min-width: 220px;
          }
          .select-wrap select option {
            color: #000; /* native dropdown list */
          }
          .select-icon, .search-icon {
            color: #ffb0b0;
            display: grid; place-items: center;
          }
          .search-wrap input::placeholder {
            color: #bbb;
          }

          .btn.refresh {
            display: inline-flex;
            align-items: center;
            gap: .5rem;
            padding: .65rem .9rem;
            border-radius: 12px;
            border: 1px solid rgba(255, 76, 76, 0.45);
            background: rgba(255, 76, 76, 0.12);
            color: #fff;
            cursor: pointer;
            transition: transform .2s ease, box-shadow .2s ease, background .2s ease;
            box-shadow: 0 8px 20px rgba(255, 76, 76, 0.15);
          }
          .btn.refresh:hover {
            transform: translateY(-1px) scale(1.02);
            box-shadow: 0 12px 25px rgba(255, 76, 76, 0.35);
            background: rgba(255, 76, 76, 0.2);
          }

          .card {
            z-index: 2;
            width: 100%;
            max-width: 1200px;
            margin-inline: auto;
            border-radius: 16px;
            border: 1px solid rgba(255, 76, 76, 0.3);
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(12px);
            box-shadow: 0 8px 24px rgba(255, 76, 76, 0.15);
          }

          .table-wrap {
            overflow: auto;
            border-radius: 16px;
          }

          .table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
          }

          .table thead th {
            position: sticky;
            top: 0;
            background:rgba(84, 11, 11, 0.8);
            color: #fff;
            text-align: left;
            padding: 0.9rem 1rem;
            font-weight: 700;
            letter-spacing: .4px;
            border-bottom: 1px solid rgba(255, 76, 76, 0.35);
            backdrop-filter: blur(10px);
          }

          .table tbody td {
            padding: 0.85rem 1rem;
            border-bottom: 1px solid rgba(255, 76, 76, 0.15);
          }

          .table tbody tr:hover {
            background: rgba(255, 76, 76, 0.12);
          }

          .table tbody tr.low-stock {
            box-shadow: inset 0 0 0 100vmax rgba(255, 76, 76, 0.06);
          }
          .table tbody tr.low-stock td:nth-child(3),
          .table tbody tr.low-stock td:nth-child(2) {
            color: #ff9d9d;
            font-weight: 700;
          }

          .empty {
            text-align: center;
            padding: 2rem !important;
            color: #ddd;
          }

          .audit {
            background: rgba(255,255,255,0.03);
          }
          .audit details {
            padding: .5rem .25rem;
          }
          .audit summary {
            cursor: pointer;
            font-weight: 700;
            margin-bottom: .5rem;
            color: #ffb0b0;
          }
          .audit ul {
            margin: 0;
            padding-left: 1.2rem;
            display: grid;
            gap: .35rem;
            list-style: disc;
          }
          .mono {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          }

          @media (max-width: 576px) {
            .title { font-size: 1.5rem; }
            .controls { justify-content: stretch; }
            .select-wrap select, .search-wrap input { min-width: 0; width: 100%; }
            .header { grid-template-columns: 1fr; }
          }
        `}
      </style>
    </div>
  );
};

export default StockSummaryPage;
