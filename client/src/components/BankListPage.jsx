// pages/BankListPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Container, Row, Col, Form, Button, Table, Badge, Accordion } from 'react-bootstrap';

// === CONFIG: point to your API/Express origin (serves /api and /uploads) ===
const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

// Use a dedicated axios instance so all calls go to port 5000 in dev
const api = axios.create({ baseURL: API_BASE });

const asAbs = (p) => {
  if (!p) return '';
  // already absolute?
  if (/^https?:\/\//i.test(p)) return p;
  // ensure leading slash and prefix API host
  const withSlash = p.startsWith('/') ? p : `/${p}`;
  return `${API_BASE}${withSlash}`;
};

const DirBadge = ({ type }) => (
  <Badge bg={type === 'received' ? 'success' : 'danger'} className="rounded-pill fw-semibold">
    {type === 'received' ? 'Inflow (Received)' : 'Outflow (Paid)'}
  </Badge>
);

const money = n => (Number(n || 0)).toLocaleString(undefined, { maximumFractionDigits: 2 });

const BankListPage = () => {
  const [banks, setBanks] = useState([]);
  const [ledgers, setLedgers] = useState({});
  const [filters, setFilters] = useState({ from_date: '', to_date: '', dir: 'all' }); // dir: all|received|paid
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/api/banks').then(res => setBanks(res.data)).catch(console.error);
  }, []);

  const fetchLedger = async (bankId) => {
    setLoading(true);
    try {
      const params = {};
      if (filters.from_date) params.from_date = filters.from_date;
      if (filters.to_date)   params.to_date   = filters.to_date;

      const { data } = await api.get(`/api/banks/${bankId}/ledger`, { params });
      setLedgers(prev => ({ ...prev, [bankId]: data }));
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = (rows) => {
    if (filters.dir === 'all') return rows;
    return rows.filter(r => r.type === filters.dir);
  };

  return (
    <div className="banks-body">
      <div className="banks-overlay" />
      <Container className="my-4 p-4 bg-white text-dark rounded-4 shadow-sm banks-container">
        <h4 className="mb-3 fw-bold heading-amroon">🏦 Banks & Ledger</h4>

        {/* Filters */}
        <Row className="align-items-end g-3 mb-3">
          <Col md={3}>
            <Form.Label>From</Form.Label>
            <Form.Control
              type="date"
              value={filters.from_date}
              onChange={e => setFilters(f => ({ ...f, from_date: e.target.value }))}
            />
          </Col>
          <Col md={3}>
            <Form.Label>To</Form.Label>
            <Form.Control
              type="date"
              value={filters.to_date}
              onChange={e => setFilters(f => ({ ...f, to_date: e.target.value }))}
            />
          </Col>
          <Col md={4}>
            <Form.Label>Quick Filter</Form.Label>
            <div className="amroon-tabs" role="tablist" aria-label="Direction">
              {['all','received','paid'].map(k => (
                <button
                  key={k}
                  className={`tab-chip ${filters.dir === k ? 'active' : ''}`}
                  onClick={() => setFilters(f => ({ ...f, dir: k }))}
                  type="button"
                >
                  {k === 'all' ? 'All' : (k === 'received' ? 'Received' : 'Paid')}
                </button>
              ))}
            </div>
          </Col>
          <Col md={2} className="text-end">
            <Button
              className="btn-amroon"
              disabled={loading}
              onClick={() => {
                // refresh all open accordions
                Object.keys(ledgers).forEach(id => fetchLedger(id));
              }}
            >
              🔄 Refresh
            </Button>
          </Col>
        </Row>

        <Accordion alwaysOpen>
          {banks.map((b, idx) => {
            const data = ledgers[b.id];
            return (
              <Accordion.Item
                key={b.id}
                eventKey={String(idx)}
                onClick={() => { if (!data) fetchLedger(b.id); }}
              >
                <Accordion.Header>
                  <div className="w-100 d-flex flex-wrap gap-2 align-items-center">
                    <div className="fw-bold me-auto">{b.name} — {b.account_number} ({b.branch})</div>
                    <span className="chip stat-chip">Inflows: <strong>Rs {money(data?.inflows)}</strong></span>
                    <span className="chip stat-chip">Outflows: <strong>Rs {money(data?.outflows)}</strong></span>
                    <span className={`chip stat-chip ${Number(data?.net) >= 0 ? 'text-success' : 'text-danger'}`}>
                      Net: <strong>Rs {money(data?.net)}</strong>
                    </span>
                    <span className="chip stat-chip">Book Balance: <strong>Rs {money(data?.bank?.balance ?? b.balance)}</strong></span>
                  </div>
                </Accordion.Header>

                <Accordion.Body>
                  <div className="bg-form-card mb-3">
                    <div className="d-flex flex-wrap gap-2">
                      <div><strong>Bank:</strong> {b.name}</div>
                      <div className="vr mx-2" />
                      <div><strong>Account #:</strong> {b.account_number}</div>
                      <div className="vr mx-2" />
                      <div><strong>Branch:</strong> {b.branch}</div>
                    </div>
                  </div>

                  <Table striped bordered hover size="sm" className="align-middle">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Direction</th>
                        <th>Counterparty</th>
                        <th>For</th>
                        <th>Invoice #</th>
                        <th>Amount (Rs)</th>
                        <th>Remarks</th>
                        <th>Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows(data?.rows || []).map(r => (
                        <tr key={r.payment_id}>
                          <td>{new Date(r.date).toLocaleDateString()}</td>
                          <td><DirBadge type={r.type} /></td>
                          <td>{r.counterparty_name || '—'}</td>
                          <td>{r.payment_for}</td>
                          <td>{r.invoice_number || '—'}</td>
                          <td className={r.type === 'paid' ? 'text-danger' : 'text-success'}>
                            {money(r.amount)}
                          </td>
                          <td>{r.remarks || ''}</td>
                          <td>
                            {r.receipt_path ? (
                              <a href={asAbs(r.receipt_path)} target="_blank" rel="noreferrer">View</a>
                            ) : '—'}
                          </td>
                        </tr>
                      ))}
                      {filteredRows(data?.rows || []).length === 0 && (
                        <tr><td colSpan={8} className="text-center">No entries.</td></tr>
                      )}
                    </tbody>
                  </Table>
                </Accordion.Body>
              </Accordion.Item>
            );
          })}
        </Accordion>
      </Container>

      {/* Amroon theme styles */}
      <style>{`
        .banks-body {
          position: relative;
          min-height: 100vh;
          padding: 2rem 0;
          background: #0d0d0d;
          overflow: hidden;
        }
        .banks-body::before {
          content: "";
          position: absolute; inset: 0;
          width: 300%; height: 300%;
          background-image:
            repeating-linear-gradient(
              120deg,
              rgba(255, 76, 76, 0.05) 0px,
              rgba(255, 76, 76, 0.05) 2px,
              transparent 2px,
              transparent 20px
            );
          animation: banksDiag 15s linear infinite;
          z-index: 0;
        }
        @keyframes banksDiag { 0% {transform: translate(0,0);} 100% {transform: translate(-20%,-20%);} }
        .banks-overlay { position: absolute; inset: 0; z-index: 1; background: radial-gradient(circle at top left, rgba(255,76,76,.08), transparent 70%); pointer-events:none; }
        .banks-container { position: relative; z-index: 2; }
        .bg-form-card {
          background: #ffffff;
          border: 1px solid rgba(255, 76, 76, 0.25);
          border-radius: 16px;
          padding: 16px;
          box-shadow: 0 6px 18px rgba(0,0,0,0.06), 0 2px 4px rgba(255,76,76,0.06) inset;
        }
        .heading-amroon { color: #1a1a1a; letter-spacing: .3px; }
        .amroon-tabs { display: inline-flex; gap: .5rem; }
        .tab-chip {
          appearance: none;
          border: 1px solid rgba(255, 76, 76, 0.35);
          background: rgba(255, 255, 255, 0.9);
          color: #222; padding: .45rem .9rem;
          border-radius: 999px; font-weight: 700; cursor: pointer; outline: none;
          transition: box-shadow .2s ease, background .2s ease, transform .06s ease;
        }
        .tab-chip:hover { transform: translateY(-1px); }
        .tab-chip.active {
          color: #ff4c4c; background: #fff;
          box-shadow: 0 0 0 3px rgba(255, 76, 76, 0.18) inset, 0 6px 14px rgba(255, 76, 76, 0.22);
          border-color: #ff4c4c;
        }
        .tab-chip:focus-visible { box-shadow: 0 0 0 3px rgba(255, 76, 76, 0.35); }
        .btn-amroon {
          background: #ff4c4c; border: 1px solid #ff4c4c;
          font-weight: 700; padding: .55rem 1rem; border-radius: 12px;
          transition: transform .08s ease, box-shadow .2s ease;
        }
        .btn-amroon:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(255, 76, 76, 0.35); }
        .chip.stat-chip {
          border: 1px solid rgba(255, 76, 76, 0.35);
          background: #fff; padding: .25rem .6rem; border-radius: 999px;
        }
      `}</style>
    </div>
  );
};

export default BankListPage;
