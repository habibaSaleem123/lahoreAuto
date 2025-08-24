import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Card, Container, Row, Col, Form, Table, Button, Spinner, Modal } from 'react-bootstrap';
import { FaSearch, FaLayerGroup, FaFileExport, FaFilter, FaSyncAlt } from 'react-icons/fa';

const LOW_STOCK = 40;

export default function StockReportPage() {
  // server-bound query bits (unchanged backend)
  const [q, setQ] = useState('');
  const [onlyInStock, setOnlyInStock] = useState(true);

  // data + loading
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // client-only filters (now open by default)
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filters, setFilters] = useState({
    description: '',
    hs_code: '',
    gd_number: '',
    unit: '',
    stocked_by: '',
    date_from: '',
    date_to: '',
    low_stock_only: false,
  });

  // keyboard & focus
  const [highlight, setHighlight] = useState(0);
  const searchRef = useRef(null);
  const tableRef = useRef(null);

  // Ledger modal
  const [showLedger, setShowLedger] = useState(false);
  const [ledgerTitle, setLedgerTitle] = useState('');
  const [ledger, setLedger] = useState([]);

  // --- server fetch (keeps your API intact) ---
  const fetchSummary = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/reports/stock/summary', {
        params: { q, only_in_stock: onlyInStock ? '1' : '0', _: Date.now() } // cache-buster
      });
      setRows(data || []);
      setHighlight(0);
    } finally {
      setLoading(false);
    }
  };

  const openLedger = async (item_id, gd_id, label) => {
    setLedgerTitle(label);
    setShowLedger(true);
    setLedger([]);
    try {
      const { data } = await axios.get('/api/reports/stock/ledger', {
        params: { item_id, gd_id, _: Date.now() }
      });
      setLedger(data?.events || []);
    } catch {
      setLedger([]);
    }
  };

  useEffect(() => { fetchSummary(); /* eslint-disable-next-line */ }, []);

  // --- client-side filtering (no backend change) ---
  const qtyOf = (r) => Number(r.current_qty || r.quantity_remaining || r.quantity || 0);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      const desc = (r.description || '').toLowerCase();
      const hs = (r.hs_code || '').toString().toLowerCase();
      const gd = (r.gd_number || '').toLowerCase();
      const unit = (r.unit || '').toLowerCase();
      const stockedBy = (r.stocked_by || '').toLowerCase();

      if (filters.description && !desc.includes(filters.description.toLowerCase())) return false;
      if (filters.hs_code && !hs.includes(filters.hs_code.toLowerCase())) return false;
      if (filters.gd_number && !gd.includes(filters.gd_number.toLowerCase())) return false;
      if (filters.unit && !unit.includes(filters.unit.toLowerCase())) return false;
      if (filters.stocked_by && !stockedBy.includes(filters.stocked_by.toLowerCase())) return false;

      if (filters.date_from || filters.date_to) {
        const ts = r.first_stocked_at || r.stocked_at || r.last_updated;
        if (ts) {
          const d = new Date(ts);
          if (filters.date_from && d < new Date(filters.date_from)) return false;
          if (filters.date_to && d > new Date(filters.date_to + 'T23:59:59')) return false;
        }
      }

      if (filters.low_stock_only && qtyOf(r) >= LOW_STOCK) return false;

      // quick search q also applied here (in addition to server)
      const qStr = (q || '').trim().toLowerCase();
      if (qStr) {
        const hay = [
          r.item_id,
          r.description,
          r.hs_code,
          r.gd_number,
          r.unit,
          r.stocked_by,
        ].join(' ').toLowerCase();
        if (!hay.includes(qStr)) return false;
      }

      return true;
    });
  }, [rows, filters, q]);

  // keep highlighted row visible
  useEffect(() => {
    const tbody = tableRef.current?.querySelector('tbody');
    if (!tbody) return;
    const row = tbody.querySelector(`[data-row="${highlight}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [highlight, filtered.length]);

  // global keyboard nav
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select', 'button'].includes(tag)) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight(h => Math.min(h + 1, Math.max(0, filtered.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight(h => Math.max(0, h - 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setHighlight(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setHighlight(Math.max(0, filtered.length - 1));
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        fetchSummary();
      } else if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFiltersOpen((v) => !v);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        clearFilters();
        setQ('');
      } else if (e.key === 'Enter') {
        const r = filtered[highlight];
        if (r) openLedger(r.item_id, r.gd_id, `${r.description} • GD ${r.gd_number}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtered, highlight]);

  // export CSV (client-only)
  const exportCsv = () => {
    if (!filtered.length) return;
    const header = [
      'Item ID','Description','HS','Unit','GD #','First Stocked','Stocked By',
      'Sold','Returned (restock)','Returned (no restock)','In Stock','Unit Cost','Value'
    ];
    const lines = [header.join(',')];
    filtered.forEach(r => {
      const value = qtyOf(r) * Number(r.unit_cost || 0);
      const row = [
        r.item_id,
        JSON.stringify(r.description || ''),  // keep commas safe
        r.hs_code,
        r.unit,
        r.gd_number,
        r.first_stocked_at || '',
        r.stocked_by || '',
        Number(r.total_sold || 0),
        Number(r.total_returned_restock || 0),
        Number(r.total_returned_no_restock || 0),
        qtyOf(r),
        Number(r.unit_cost || 0).toFixed(2),
        value.toFixed(2)
      ];
      lines.push(row.join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `stock_report_${new Date().toISOString().slice(0,19)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => setFilters({
    description: '',
    hs_code: '',
    gd_number: '',
    unit: '',
    stocked_by: '',
    date_from: '',
    date_to: '',
    low_stock_only: false,
  });

  return (
    <div className="stock-report-page">
      <div className="overlay" aria-hidden />
      <Container className="py-4">

        {/* Header */}
        <header className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
          <div className="d-flex align-items-center gap-2">
            <FaLayerGroup className="title-icon" />
            <h2 className="m-0 title">Stock Report</h2>
          </div>

          <div className="controls d-flex gap-2 flex-wrap">
            <div className="search-wrap">
              <FaSearch className="search-icon" />
              <input
                ref={searchRef}
                placeholder="Search description / HS / GD / Item ID"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') fetchSummary(); }}
              />
            </div>

            <Form.Check
              type="switch"
              id="only-in-stock"
              label="Only in stock"
              checked={onlyInStock}
              onChange={(e) => setOnlyInStock(e.target.checked)}
              className="only-stock"
            />

            <Button variant="outline-dark" onClick={fetchSummary} title="Refresh (R)">
              <FaSyncAlt /> <span className="ms-1">Refresh</span>
            </Button>

            <Button variant="outline-dark" onClick={() => setFiltersOpen(v => !v)} title="Show/Hide Filters (F)">
              <FaFilter /> <span className="ms-1">{filtersOpen ? 'Hide Filters' : 'Show Filters'}</span>
            </Button>

            <Button variant="outline-dark" onClick={exportCsv} disabled={!filtered.length} title="Export CSV">
              <FaFileExport /> <span className="ms-1">Export</span>
            </Button>
          </div>
        </header>

        {/* Filter panel — visible by default */}
        {filtersOpen && (
          <Card className="glass mb-3">
            <Card.Body>
              <Form>
                <Row className="g-3">
                  <Col md={4} lg={3}>
                    <Form.Label>Description</Form.Label>
                    <Form.Control
                      value={filters.description}
                      onChange={e => setFilters(f => ({ ...f, description: e.target.value }))}
                    />
                  </Col>
                  <Col md={4} lg={2}>
                    <Form.Label>HS Code</Form.Label>
                    <Form.Control
                      value={filters.hs_code}
                      onChange={e => setFilters(f => ({ ...f, hs_code: e.target.value }))}
                    />
                  </Col>
                  <Col md={4} lg={2}>
                    <Form.Label>GD #</Form.Label>
                    <Form.Control
                      value={filters.gd_number}
                      onChange={e => setFilters(f => ({ ...f, gd_number: e.target.value }))}
                    />
                  </Col>
                  <Col md={4} lg={2}>
                    <Form.Label>Unit</Form.Label>
                    <Form.Control
                      value={filters.unit}
                      onChange={e => setFilters(f => ({ ...f, unit: e.target.value }))}
                    />
                  </Col>
                  <Col md={4} lg={3}>
                    <Form.Label>Stocked By</Form.Label>
                    <Form.Control
                      value={filters.stocked_by}
                      onChange={e => setFilters(f => ({ ...f, stocked_by: e.target.value }))}
                    />
                  </Col>

                  <Col xs={6} md={4} lg={2}>
                    <Form.Label>From</Form.Label>
                    <Form.Control
                      type="date"
                      value={filters.date_from}
                      onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
                    />
                  </Col>
                  <Col xs={6} md={4} lg={2}>
                    <Form.Label>To</Form.Label>
                    <Form.Control
                      type="date"
                      value={filters.date_to}
                      onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))}
                    />
                  </Col>
                  <Col xs={12} md={4} lg={3} className="d-flex align-items-end">
                    <Form.Check
                      type="switch"
                      id="low-stock-only"
                      label={`Low stock only (< ${LOW_STOCK})`}
                      checked={filters.low_stock_only}
                      onChange={e => setFilters(f => ({ ...f, low_stock_only: e.target.checked }))}
                    />
                  </Col>
                  <Col xs="auto" className="d-flex align-items-end">
                    <Button variant="outline-dark" onClick={clearFilters}>Clear</Button>
                  </Col>
                </Row>
              </Form>
            </Card.Body>
          </Card>
        )}

        {/* Table */}
        <Card className="glass">
          <Card.Body className="p-0">
            <div className="table-wrap">
              <Table ref={tableRef} responsive hover className="table-darkish mb-0">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>HS</th>
                    <th>Unit</th>
                    <th>GD #</th>
                    <th>First Stocked</th>
                    <th>Stocked By</th>
                    <th>Sold</th>
                    <th>Returned (restock)</th>
                    <th>Returned (no restock)</th>
                    <th>In Stock</th>
                    <th>Cost</th>
                    <th>Value</th>
                    <th>Ledger</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr><td colSpan={13} className="text-center py-5"><Spinner animation="border" /></td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={13} className="text-center py-4">No rows.</td></tr>
                  ) : (
                    filtered.map((r, i) => {
                      const value = qtyOf(r) * Number(r.unit_cost || 0);
                      const low = qtyOf(r) < LOW_STOCK;
                      const label = `${r.description} • GD ${r.gd_number}`;
                      const active = i === highlight;
                      return (
                        <tr
                          key={`${r.item_id}-${r.gd_id}-${i}`}
                          className={`${low ? 'low-stock' : ''} ${active ? 'row-active' : ''}`}
                          data-row={i}
                          onMouseEnter={() => setHighlight(i)}
                        >
                          <td>
                            <div className="td-primary">{r.description}</div>
                            <div className="td-sub mono">Item #{r.item_id}</div>
                          </td>
                          <td>{r.hs_code}</td>
                          <td>{r.unit}</td>
                          <td className="mono">{r.gd_number}</td>
                          <td>{r.first_stocked_at ? new Date(r.first_stocked_at).toLocaleString() : '-'}</td>
                          <td>{r.stocked_by || '-'}</td>
                          <td>{Number(r.total_sold || 0)}</td>
                          <td className="text-success">{Number(r.total_returned_restock || 0)}</td>
                          <td className="text-warning">{Number(r.total_returned_no_restock || 0)}</td>
                          <td className={low ? 'warn' : ''}>{qtyOf(r)}</td>
                          <td>Rs {Number(r.unit_cost || 0).toFixed(2)}</td>
                          <td>Rs {value.toFixed(2)}</td>
                          <td>
                            <Button
                              size="sm"
                              className="btn-ghost"
                              onClick={() => openLedger(r.item_id, r.gd_id, label)}
                            >
                              View
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </Table>
            </div>
          </Card.Body>
        </Card>
      </Container>

      {/* Ledger Modal */}
      <Modal show={showLedger} onHide={() => setShowLedger(false)} size="lg" centered contentClassName="modal-dark">
        <Modal.Header closeButton>
          <Modal.Title>Ledger — {ledgerTitle}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Table responsive bordered className="table-darkish mb-0">
            <thead>
              <tr>
                <th>Date/Time</th>
                <th>Type</th>
                <th>Actor</th>
                <th className="text-end">Δ Qty</th>
                <th className="text-end">Balance</th>
                <th>Ref</th>
                <th className="text-end">Cost</th>
                <th className="text-end">MRP</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-3">No events.</td></tr>
              ) : ledger.map((e, i) => (
                <tr key={i} className={e.delta < 0 ? 'row-sale' : e.type === 'return-no-restock' ? 'row-return-nr' : ''}>
                  <td>{new Date(e.ts).toLocaleString()}</td>
                  <td className="mono">{e.type}</td>
                  <td>{e.actor || '-'}</td>
                  <td className={`text-end ${e.delta < 0 ? 'text-danger' : 'text-success'}`}>{e.delta > 0 ? '+' : ''}{e.delta}</td>
                  <td className="text-end">{e.balance_after}</td>
                  <td className="mono">{e.ref || '-'}</td>
                  <td className="text-end">Rs {Number(e.unit_cost ?? 0).toFixed(2)}</td>
                  <td className="text-end">Rs {Number(e.mrp ?? 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Modal.Body>
      </Modal>

      {/* Styles */}
      <style>{`
        :root{
          --bg:#0d0d0d;
          --accent:#ff4c4c;
          --glass:rgba(255,255,255,0.06);
          --border:rgba(255,76,76,0.35);
          --text:#f5f5f5;
          --muted:#bdbdbd;
        }
        .stock-report-page{
          position:relative; min-height:100vh; background:var(--bg); color:var(--text);
          padding: 1rem 0 2rem;
        }
        /* tighten the animated background so it doesn't create scrollable empty space */
        .stock-report-page::before{
          content:""; position:absolute; inset:0;
          background: repeating-linear-gradient(120deg, rgba(255,76,76,.05) 0 2px, transparent 2px 20px);
          animation: moveBg 16s linear infinite; z-index:0; pointer-events:none;
        }
        @keyframes moveBg { to { transform: translate(-22%, -22%); } }
        .overlay{ position:absolute; inset:0; background: radial-gradient(900px 520px at top left, rgba(255,76,76,.08), transparent 60%); z-index:1; pointer-events:none; }

        .title{ letter-spacing:1px; text-transform:uppercase; color:var(--accent); text-shadow:0 2px 10px rgba(255,76,76,.45); }
        .title-icon{ color:var(--accent); filter: drop-shadow(0 2px 10px rgba(255,76,76,.45)); }

        .controls .search-wrap{
          display:flex; align-items:center; gap:.5rem; padding:.45rem .7rem;
          border:1px solid var(--border); border-radius:12px; background:rgba(255,255,255,0.06);
        }
        .search-wrap input{ background:transparent; border:none; outline:none; color:#fff; min-width:300px; }
        .search-icon{ color:var(--muted); }
        .only-stock{ display:flex; align-items:center; color:black; }

        .glass{ position:relative; z-index:2; background: var(--glass); border:1px solid var(--border); border-radius:16px; box-shadow:0 8px 24px rgba(255,76,76,.12); }

        /* let the table take natural height so there's no weird empty strip below */
        .table-wrap { overflow-x:auto; }
        .table-darkish thead th{ background: rgba(84, 11, 11, 0.8); color:#fff; position:sticky; top:0; backdrop-filter: blur(10px); z-index:3; }
        .table-darkish tbody tr:hover{ background: rgba(255,255,255,.03); }
        .row-active { outline: 2px solid rgba(255,76,76,.5); outline-offset: -2px; }

        .btn-ghost{ background: rgba(71, 14, 14, 0.86); border: 1px solid var(--border); color: #fff; }
        .btn-ghost:hover{ background: rgba(255,76,76,.15); border-color: var(--accent); }
        .td-primary{ font-weight:700; }
        .td-sub{ color:var(--muted); font-size:.85rem; }
        .mono{ font-family: ui-monospace, Menlo, Consolas, monospace; }
        .warn{ color:#ff9d9d; font-weight:700; }
        .low-stock{ box-shadow: inset 0 0 0 100vmax rgba(255,76,76,.06); }
        .modal-dark{ background:#121218; color:#fff; border: 1px solid var(--border); }
        .row-sale{ background: rgba(255,76,76,.05); }
        .row-return-nr{ background: rgba(255,255,255,.03); opacity:.85; }
      `}</style>
    </div>
  );
}
