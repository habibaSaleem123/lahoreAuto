// src/components/ProfitSummaryPage.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Container, Row, Col, Card, Table, Button, Form, Spinner, Badge, Alert
} from 'react-bootstrap';
import { FaChartLine, FaSearch, FaRedo, FaFileExport } from 'react-icons/fa';

const GROUPS = [
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
];

export default function ProfitSummaryPage() {
  // Filters
  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState('');
  const [groupBy, setGroupBy] = useState('month');
  const [taxSection, setTaxSection] = useState('all');   // all | 236G | 236H
  const [filer, setFiler] = useState('all');             // all | filer | non-filer
  const [q, setQ] = useState('');                        // optional quick filter (customer/item)
  const searchRef = useRef(null);

  // Data
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState({
    revenue: 0, refunds: 0, net_revenue: 0,
    cogs: 0, gross_profit: 0, gross_margin_pct: 0,
    sales_tax: 0, income_tax_paid: 0, withholding_tax: 0,
    net_profit: 0, invoices: 0, items_sold: 0, returns: 0
  });
  const [trend, setTrend] = useState([]);          // [{ period, revenue, cogs, gross_profit, net_profit }]
  const [topProducts, setTopProducts] = useState([]); // [{ item_id, description, qty, revenue, gp }]
  const [topCustomers, setTopCustomers] = useState([]); // [{ customer_id, name, revenue, gp }]

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/reports/profit/summary', {
        params: {
          from: from || undefined,
          to: to || undefined,
          group_by: groupBy,
          tax_section: taxSection,
          filer_status: filer,
          q: q || undefined,
          _: Date.now(), // cache buster to avoid stale responses
        }
      });
      setTotals(data?.totals || {});
      setTrend(Array.isArray(data?.trend) ? data.trend : []);
      setTopProducts(Array.isArray(data?.top_products) ? data.top_products : []);
      setTopCustomers(Array.isArray(data?.top_customers) ? data.top_customers : []);
    } catch {
      // graceful fallback
      setTotals(t => ({ ...t, revenue: 0, net_profit: 0 }));
      setTrend([]); setTopProducts([]); setTopCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => { fetchSummary(); /* eslint-disable-next-line */ }, []);

  // Auto-refetch when ANY filter changes (debounced so typing doesn't spam)
  useEffect(() => {
    const t = setTimeout(() => { fetchSummary(); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, groupBy, taxSection, filer, q]);

  // Keyboard shortcuts: Ctrl/Cmd+F focus filter, Enter refresh, Left/Right cycle group
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (['input','select','textarea','button'].includes(tag)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault(); searchRef.current?.focus();
      } else if (e.key === 'Enter') {
        e.preventDefault(); fetchSummary();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const idx = GROUPS.findIndex(g => g.key === groupBy);
        const next = e.key === 'ArrowRight'
          ? GROUPS[(idx + 1) % GROUPS.length].key
          : GROUPS[(idx - 1 + GROUPS.length) % GROUPS.length].key;
        setGroupBy(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [groupBy]);

  const hasData = useMemo(
    () => (trend?.length || 0) > 0 || (topProducts?.length || 0) > 0 || (topCustomers?.length || 0) > 0,
    [trend, topProducts, topCustomers]
  );

  return (
    <div className="profit-page">
      <div className="overlay" aria-hidden />
      <Container className="py-4">
        {/* Header */}
        <header className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
          <div className="d-flex align-items-center gap-2">
            <FaChartLine className="title-icon" />
            <h2 className="m-0 title">Profit Summary</h2>
            <Badge bg="dark" pill>{GROUPS.find(g=>g.key===groupBy)?.label}</Badge>
          </div>

          <div className="controls d-flex flex-wrap align-items-center gap-2">
            <Form.Control type="date" value={from} onChange={e=>setFrom(e.target.value)} title="From date" />
            <Form.Control type="date" value={to}   onChange={e=>setTo(e.target.value)}   title="To date" />
            <Form.Select value={groupBy} onChange={e=>setGroupBy(e.target.value)} title="Group by" style={{ minWidth: 120 }}>
              {GROUPS.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
            </Form.Select>
            <Form.Select value={taxSection} onChange={(e)=>setTaxSection(e.target.value)} title="Tax section" style={{ minWidth: 140 }}>
              <option value="all">All Sections</option>
              <option value="236G">236G (Distributor)</option>
              <option value="236H">236H (Retailer)</option>
            </Form.Select>
            <Form.Select value={filer} onChange={(e)=>setFiler(e.target.value)} title="Filer status" style={{ minWidth: 140 }}>
              <option value="all">All Filers</option>
              <option value="filer">Filer</option>
              <option value="non-filer">Non-Filer</option>
            </Form.Select>
            <div className="search-wrap">
              <FaSearch className="search-icon" />
              <input
                ref={searchRef}
                placeholder="Filter by customer / item"
                value={q}
                onChange={(e)=>setQ(e.target.value)}
                onKeyDown={(e)=>{ if (e.key==='Enter') fetchSummary(); }}
              />
            </div>
            <Button variant="outline-dark" onClick={fetchSummary}><FaRedo /> Refresh</Button>
            <Button variant="outline-warning" onClick={()=>{
              // CSV export: totals + trend + leaders
              const lines = [];
              lines.push('--- PROFIT TOTALS ---');
              Object.entries(totals || {}).forEach(([k, v]) => lines.push(`${k},${Number(v || 0).toFixed(2)}`));
              lines.push('');
              lines.push('--- TREND ---');
              lines.push(['period','revenue','cogs','gross_profit','net_profit'].join(','));
              trend.forEach(r => lines.push([
                r.period,
                Number(r.revenue||0).toFixed(2),
                Number(r.cogs||0).toFixed(2),
                Number(r.gross_profit||0).toFixed(2),
                Number(r.net_profit||0).toFixed(2)
              ].join(',')));
              lines.push('');
              lines.push('--- TOP PRODUCTS ---');
              lines.push(['item_id','description','qty','revenue','gross_profit'].join(','));
              topProducts.forEach(p => lines.push([
                p.item_id, (p.description||'').replaceAll(',',' '),
                Number(p.qty||0).toFixed(2),
                Number(p.revenue||0).toFixed(2),
                Number(p.gp||0).toFixed(2)
              ].join(',')));
              lines.push('');
              lines.push('--- TOP CUSTOMERS ---');
              lines.push(['customer_id','name','revenue','gross_profit'].join(','));
              topCustomers.forEach(c => lines.push([
                c.customer_id, (c.name||'').replaceAll(',',' '),
                Number(c.revenue||0).toFixed(2),
                Number(c.gp||0).toFixed(2)
              ].join(',')));
              const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = `profit-summary_${new Date().toISOString().slice(0,10)}.csv`;
              a.click(); URL.revokeObjectURL(url);
            }}>
              <FaFileExport /> Export
            </Button>
          </div>
        </header>

        {/* KPIs */}
        <div className='glass mt-3 border-2'>
        <Row className="g-3">
          <Col md={3}><Stat label="Revenue" value={totals.net_revenue ?? totals.revenue} prefix="Rs " bold /></Col>
          <Col md={3}><Stat label="COGS" value={totals.cogs} prefix="Rs " /></Col>
          <Col md={3}><Stat label="Gross Profit" value={totals.gross_profit} prefix="Rs " bold /></Col>
          <Col md={3}><Stat label="Gross Margin" value={totals.gross_margin_pct} suffix=" %" /></Col>

          <Col md={3}><Stat label="Sales Tax" value={totals.sales_tax} prefix="Rs " /></Col>
          <Col md={3}><Stat label="Withholding Tax" value={totals.withholding_tax} prefix="Rs " /></Col>
          <Col md={3}><Stat label="Income Tax Paid (GD)" value={totals.income_tax_paid} prefix="Rs " /></Col>
          <Col md={3}><Stat label="Net Profit" value={totals.net_profit} prefix="Rs " bold /></Col>
        </Row>
        </div>

        {/* Trend */}
        <Card className="glass mt-3">
          <Card.Header className="bg-transparent border-0">
            <strong>Trend ({GROUPS.find(g=>g.key===groupBy)?.label})</strong>
            <div className="small ">Revenue, COGS, Gross Profit, Net Profit</div>
          </Card.Header>
          <Card.Body className="p-0">
            <Table responsive hover className="table-darkish mb-0">
              <thead>
                <tr>
                  <th>Period</th>
                  <th className="text-end">Revenue</th>
                  <th className="text-end">COGS</th>
                  <th className="text-end">Gross Profit</th>
                  <th className="text-end">Net Profit</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="text-center py-4"><Spinner animation="border" /></td></tr>
                ) : trend.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-4">No data.</td></tr>
                ) : trend.map((r, i) => (
                  <tr key={i}>
                    <td className="mono">{r.period}</td>
                    <td className="text-end">Rs {Number(r.revenue||0).toFixed(2)}</td>
                    <td className="text-end">Rs {Number(r.cogs||0).toFixed(2)}</td>
                    <td className="text-end">Rs {Number(r.gross_profit||0).toFixed(2)}</td>
                    <td className="text-end">Rs {Number(r.net_profit||0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card.Body>
        </Card>

        {/* Leaders */}
        <Row className="g-3 mt-1">
          <Col md={6}>
            <Card className="glass h-100">
              <Card.Header className="bg-transparent border-0"><strong>Top Products</strong></Card.Header>
              <Card.Body className="p-0">
                <Table responsive hover className="table-darkish mb-0">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th className="text-end">Qty</th>
                      <th className="text-end">Revenue</th>
                      <th className="text-end">Gross Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-3">—</td></tr>
                    ) : topProducts.map((p, i) => (
                      <tr key={i}>
                        <td>{p.description}</td>
                        <td className="text-end">{Number(p.qty||0)}</td>
                        <td className="text-end">Rs {Number(p.revenue||0).toFixed(2)}</td>
                        <td className="text-end">Rs {Number(p.gp||0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </Col>

          <Col md={6}>
            <Card className="glass h-100">
              <Card.Header className="bg-transparent border-0"><strong>Top Customers</strong></Card.Header>
              <Card.Body className="p-0">
                <Table responsive hover className="table-darkish mb-0">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th className="text-end">Revenue</th>
                      <th className="text-end">Gross Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCustomers.length === 0 ? (
                      <tr><td colSpan={3} className="text-center py-3">—</td></tr>
                    ) : topCustomers.map((c, i) => (
                      <tr key={i}>
                        <td>{c.name}</td>
                        <td className="text-end">Rs {Number(c.revenue||0).toFixed(2)}</td>
                        <td className="text-end">Rs {Number(c.gp||0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {!hasData && !loading && (
          <Alert variant="dark" className="glass-soft mt-3">
            No profit data for the selected filters yet. Try widening your date range.
          </Alert>
        )}
      </Container>

      {/* Styles */}
      <style>{`
        :root{
          --bg:#0d0d0d; --accent:#ff4c4c; --glass:rgba(124, 47, 47, 0.89);
          --border:rgba(255,76,76,0.35); --text:#f5f5f5; --muted:#bdbdbd;
        }
        .profit-page{
          position:relative; min-height:100vh; background:var(--bg); color:var(--text);
          padding: 1rem 0 2rem; overflow-x:hidden;
        }
        /* tightened background so there's no empty scroll space */
        .profit-page::before{
          content:""; position:absolute; inset:0;
          background: repeating-linear-gradient(120deg, rgba(255,76,76,.05) 0 2px, transparent 2px 20px);
          animation: moveBg 16s linear infinite; z-index:0; pointer-events:none;
        }
        @keyframes moveBg { to { transform: translate(-22%, -22%); } }
        .overlay{ position:absolute; inset:0; background: radial-gradient(1000px 600px at top left, rgba(255,76,76,.08), transparent 60%); z-index:1; pointer-events:none; }
        .title{ letter-spacing:1px; text-transform:uppercase; color:var(--accent); text-shadow:0 2px 10px rgba(255,76,76,.45); }
        .title-icon{ color:var(--accent); filter: drop-shadow(0 2px 10px rgba(255,76,76,.45)); }
        .controls .search-wrap{
          display:flex; align-items:center; gap:.5rem; padding:.45rem .7rem;
          border:1px solid var(--border); border-radius:12px; background:rgba(255,255,255,0.06);
        }
        .search-wrap input{ background:transparent; border:none; outline:none; color:#fff; min-width:220px; }
        .search-icon{ color:var(--muted); }
        .glass{ position:relative; z-index:2; background: var(--glass); border:1px solid var(--border); border-radius:16px; box-shadow:0 8px 24px rgba(255,76,76,.12); }
        .glass-soft{ border-color: rgba(255,255,255,.12); background: rgba(255,255,255,.03); color:#fff; }
        .table-darkish thead th{ background: rgba(84, 11, 11, 0.8); color:#fff; position:sticky; top:0; backdrop-filter: blur(10px); }
        .table-darkish tbody tr:hover{ background: rgba(255,255,255,.03); }
        .mono{ font-family: ui-monospace, Menlo, Consolas, monospace; }
      `}</style>
    </div>
  );
}

function Stat({ label, value, prefix = '', suffix = '', bold = false }) {
  return (
    <Card className="glass-soft">
      <Card.Body className="py-2">
        <div className="small">{label}</div>
        <div className={`fs-5 ${bold ? 'fw-bold' : ''}`}>
          {prefix}{Number(value || 0).toFixed(2)}{suffix}
        </div>
      </Card.Body>
    </Card>
  );
}
