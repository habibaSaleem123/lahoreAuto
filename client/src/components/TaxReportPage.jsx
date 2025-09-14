// src/components/TaxReportPage.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Container, Card, Row, Col, Form, Table, Button, Spinner, Modal, Badge
} from 'react-bootstrap';
import {
  FaCalculator, FaSearch, FaFilter, FaRedo, FaFileExport, FaInfoCircle
} from 'react-icons/fa';

const PAGE_SIZE = 25;

export default function TaxReportPage() {
  // Filters
  const [search, setSearch] = useState('');
  const [taxSection, setTaxSection] = useState('');         // '', '236G', '236H'
  const [filerStatus, setFilerStatus] = useState('all');    // 'all' | 'filer' | 'non-filer'
  const [paymentStatus, setPaymentStatus] = useState('');   // '', 'paid', 'unpaid'
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Data
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);

  // Drill-down
  const [showDetail, setShowDetail] = useState(false);
  const [detailTitle, setDetailTitle] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Keyboard focus
  const searchRef = useRef(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/sales/invoices', {
        params: {
          search: search || '',
          tax_section: taxSection || '',
          filer_status: filerStatus === 'all' ? 'all' : filerStatus || '',
          payment_status: paymentStatus || '',
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          _: Date.now(), // cache-buster to avoid stale responses
        }
      });
      setRows(Array.isArray(data) ? data : []);
      setPage(1);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, []);

  // Auto-refetch when filters change (debounced)
  useEffect(() => {
    const t = setTimeout(() => { fetchData(); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, taxSection, filerStatus, paymentStatus, fromDate, toDate]);

  // Totals & grouped summaries
  const computed = useMemo(() => {
    const safe = (n) => Number(n || 0);
    let gross = 0, salesTax = 0, withholding = 0, incomeTaxPaid = 0;

    const byMonth = new Map(); // 'YYYY-MM' -> {gross, salesTax, withholding, incomeTaxPaid, count}

    rows.forEach(r => {
      const g = safe(r.gross_total);
      const st = safe(r.sales_tax);
      const w  = safe(r.withholding_tax);
      const it = safe(r.income_tax_paid);
      gross += g; salesTax += st; withholding += w; incomeTaxPaid += it;

      const key = (r.created_at || '').slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, { gross: 0, salesTax: 0, withholding: 0, incomeTaxPaid: 0, count: 0 });
      const m = byMonth.get(key);
      m.gross += g; m.salesTax += st; m.withholding += w; m.incomeTaxPaid += it; m.count += 1;
    });

    const monthly = [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({
        month,
        ...v,
        netTaxPayable: v.salesTax - v.withholding - v.incomeTaxPaid
      }));

    return {
      total: {
        gross,
        salesTax,
        withholding,
        incomeTaxPaid,
        netTaxPayable: salesTax - withholding - incomeTaxPaid
      },
      monthly
    };
  }, [rows]);

  // Client-side pagination
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

  // Detail loader
  const openDetail = async (invoice_number, customer_name) => {
    setDetailTitle(`${invoice_number} — ${customer_name}`);
    setShowDetail(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      const { data } = await axios.get(`/api/sales/invoice/${invoice_number}`);
      setDetail(data || null);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // CSV export (current filter result)
  const exportCSV = () => {
    const headers = [
      'Invoice #', 'Date', 'Customer', 'Section', 'Filer',
      'Gross', 'Sales Tax', 'Withholding', 'Income Tax Paid', 'Net Tax Payable', 'Paid?'
    ];
    const lines = [headers.join(',')];

    rows.forEach(r => {
      const gross = Number(r.gross_total || 0);
      const st = Number(r.sales_tax || 0);
      const w  = Number(r.withholding_tax || 0);
      const it = Number(r.income_tax_paid || 0);
      const net = st - w - it;
      const paid = r.is_paid ? 'Yes' : 'No';
      const date = r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '';
      const filer = r.filer_status || '';
      lines.push([
        r.invoice_number,
        date,
        (r.customer_name || '').replaceAll(',', ' '),
        r.tax_section || '',
        filer,
        gross.toFixed(2),
        st.toFixed(2),
        w.toFixed(2),
        it.toFixed(2),
        net.toFixed(2),
        paid
      ].join(','));
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `tax-report_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Keyboard: Enter refresh, Ctrl/Cmd+F focus search, arrows page
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        fetchData();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault(); setPage(p => Math.min(pageCount, p + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault(); setPage(p => Math.max(1, p - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pageCount, fetchData]);  

  const HeaderSummary = () => (
<Card className="glass mb-3">
  <Card.Body className="text-white">
    <div className="d-flex align-items-center gap-2 mb-2">
      <FaCalculator />
      <strong>Summary (filtered)</strong>
      <span className="small">Net Tax Payable = Sales Tax − Withholding − Income Tax Paid</span>
    </div>
    <Row xs={1} md={5} className="g-2">
      <Col>
        <Stat label="Gross" value={computed.total.gross} prefix="Rs " />
      </Col>
      <Col>
        <Stat label="Sales Tax" value={computed.total.salesTax} prefix="Rs " />
      </Col>
      <Col>
        <Stat label="Withholding" value={computed.total.withholding} prefix="Rs " />
      </Col>
      <Col>
        <Stat label="Income Tax Paid" value={computed.total.incomeTaxPaid} prefix="Rs " />
      </Col>
      <Col>
        <Stat label="Net Tax Payable" value={computed.total.netTaxPayable} prefix="Rs " bold />
      </Col>
    </Row>
  </Card.Body>
</Card>

  );

  const Stat = ({ label, value, prefix = '', bold = false }) => (
    <Card className="mini glass-soft text-white">
      <Card.Body className="py-2">
        <div className="stat-label small">{label}</div>
        <div className={`fs-5 ${bold ? 'fw-bold' : ''}`}>
          {prefix}{Number(value || 0).toFixed(2)}
        </div>
      </Card.Body>
    </Card>
  );
  

  return (
    <div className="tax-report-page">
      <div className="overlay" aria-hidden />
      <Container className="py-4">
        {/* Header & filters */}
        <header className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
          <div className="d-flex align-items-center gap-2">
            <FaCalculator className="title-icon" />
            <h2 className="m-0 title">Tax Report</h2>
            <Badge bg="dark" pill>{rows.length} invoices</Badge>
          </div>

          <div className="controls d-flex flex-wrap align-items-center gap-2">
            <div className="search-wrap">
              <FaSearch className="search-icon" />
              <input
                ref={searchRef}
                placeholder="Search invoice # / customer"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') fetchData(); }}
              />
            </div>

            <Form.Select
              value={taxSection}
              onChange={(e) => setTaxSection(e.target.value)}
              title="Tax Section"
            >
              <option value="">All Sections</option>
              <option value="236H">236H (Retailer)</option>
              <option value="236G">236G (Distributor)</option>
            </Form.Select>

            <Form.Select
              value={filerStatus}
              onChange={(e) => setFilerStatus(e.target.value)}
              title="Filer Status"
            >
              <option value="all">All Filers</option>
              <option value="filer">Filer</option>
              <option value="non-filer">Non-Filer</option>
            </Form.Select>

            <Form.Select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)}
              title="Payment Status"
            >
              <option value="">All</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </Form.Select>

            <Form.Control
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              title="From date"
            />
            <Form.Control
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              title="To date"
            />

            <Button variant="outline-dark" onClick={fetchData} title="Refresh">
              <FaRedo /> Refresh
            </Button>

            <Button variant="outline-warning" onClick={exportCSV} title="Export CSV">
              <FaFileExport /> Export
            </Button>
          </div>
        </header>

        {/* Quick legend */}
        <Card className="glass mb-3">
          <Card.Body className="py-2 d-flex align-items-center gap-2">
            <FaInfoCircle />
            <div className="small ">
              Sales Tax is output tax on retail. Withholding is collected u/s 236G/H.
              Income Tax Paid is aggregated from GDs used in the invoice.
              <strong> Net Tax Payable = Sales Tax − Withholding − Income Tax Paid.</strong>
            </div>
          </Card.Body>
        </Card>

        <HeaderSummary />

        {/* Monthly buckets */}
        {computed.monthly.length > 0 && (
          <Card className="glass mb-3">
            <Card.Header className="bg-transparent border-0">
              <strong>Monthly Summary</strong>
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover className="table-darkish mb-0">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="text-end">Invoices</th>
                    <th className="text-end">Gross</th>
                    <th className="text-end">Sales Tax</th>
                    <th className="text-end">Withholding</th>
                    <th className="text-end">Income Tax Paid</th>
                    <th className="text-end">Net Tax Payable</th>
                  </tr>
                </thead>
                <tbody>
                  {computed.monthly.map((m) => (
                    <tr key={m.month}>
                      <td className="mono">{m.month}</td>
                      <td className="text-end">{m.count}</td>
                      <td className="text-end">Rs {m.gross.toFixed(2)}</td>
                      <td className="text-end">Rs {m.salesTax.toFixed(2)}</td>
                      <td className="text-end">Rs {m.withholding.toFixed(2)}</td>
                      <td className="text-end">Rs {m.incomeTaxPaid.toFixed(2)}</td>
                      <td className="text-end fw-bold">Rs {m.netTaxPayable.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        )}

        {/* Invoices table */}
        <Card className="glass">
          <Card.Header className="bg-transparent border-0 d-flex justify-content-between align-items-center">
            <strong>Invoices</strong>
            <div className="small ">
              Page {page} / {pageCount} &nbsp;•&nbsp; Use ←/→ to change page, Enter to refresh, Ctrl/Cmd+F to focus search
            </div>
          </Card.Header>
          <Card.Body className="p-0">
            <Table responsive hover className="table-darkish mb-0">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Section</th>
                  <th>Filer</th>
                  <th className="text-end">Gross</th>
                  <th className="text-end">Sales Tax</th>
                  <th className="text-end">Withholding</th>
                  <th className="text-end">Income Tax Paid</th>
                  <th className="text-end">Net Tax Payable</th>
                  <th className="text-center">Paid?</th>
                  <th className="text-center">View</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={12} className="text-center py-5"><Spinner animation="border" /></td></tr>
                ) : paged.length === 0 ? (
                  <tr><td colSpan={12} className="text-center py-4">No invoices found.</td></tr>
                ) : (
                  paged.map(inv => {
                    const gross = Number(inv.gross_total || 0);
                    const st = Number(inv.sales_tax || 0);
                    const w  = Number(inv.withholding_tax || 0);
                    const it = Number(inv.income_tax_paid || 0);
                    const net = st - w - it;
                    const date = inv.created_at ? new Date(inv.created_at).toLocaleString() : '-';
                    return (
                      <tr key={inv.invoice_number}>
                        <td className="mono">{inv.invoice_number}</td>
                        <td>{date}</td>
                        <td>{inv.customer_name}</td>
                        <td>{inv.tax_section}</td>
                        <td className="mono">{inv.filer_status}</td>
                        <td className="text-end">Rs {gross.toFixed(2)}</td>
                        <td className="text-end">Rs {st.toFixed(2)}</td>
                        <td className="text-end">Rs {w.toFixed(2)}</td>
                        <td className="text-end">Rs {it.toFixed(2)}</td>
                        <td className={`text-end ${net >= 0 ? 'text-success' : 'text-warning'}`}>Rs {net.toFixed(2)}</td>
                        <td className="text-center">{inv.is_paid ? '✅' : '—'}</td>
                        <td className="text-center">
                          <Button
                            size="sm"
                            className="btn-ghost"
                            onClick={() => openDetail(inv.invoice_number, inv.customer_name)}
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
          </Card.Body>

          {/* Paginator */}
          <Card.Footer className="bg-transparent d-flex justify-content-between align-items-center">
            <div className="d-flex align-items-center gap-2">
              <FaFilter />
              <span className="small ">Showing {paged.length} of {rows.length}</span>
            </div>
            <div className="d-flex align-items-center gap-2">
              <Button
                variant="outline-light"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                ◀ Prev
              </Button>
              <span className="small mono">{page} / {pageCount}</span>
              <Button
                variant="outline-light"
                size="sm"
                disabled={page >= pageCount}
                onClick={() => setPage(p => Math.min(pageCount, p + 1))}
              >
                Next ▶
              </Button>
            </div>
          </Card.Footer>
        </Card>
      </Container>

      {/* Detail Modal */}
      <Modal
        show={showDetail}
        onHide={() => setShowDetail(false)}
        size="lg"
        centered
        contentClassName="modal-dark"
      >
        <Modal.Header closeButton>
          <Modal.Title>Invoice — {detailTitle}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {detailLoading ? (
            <div className="text-center py-4"><Spinner animation="border" /></div>
          ) : !detail ? (
            <div className="text-center py-4">Failed to load invoice.</div>
          ) : (
            <>
              <Row className="mb-3">
                <Col md={6}>
                  <div><strong>Tax Section:</strong> {detail.invoice.tax_section}</div>
                  <div><strong>Filer Status:</strong> {detail.invoice.filer_status}</div>
                  <div><strong>Created:</strong> {new Date(detail.invoice.created_at).toLocaleString()}</div>
                </Col>
                <Col md={6} className="text-md-end">
                  <div><strong>Gross:</strong> Rs {Number(detail.invoice.gross_total).toFixed(2)}</div>
                  <div><strong>Sales Tax:</strong> Rs {Number(detail.invoice.sales_tax).toFixed(2)}</div>
                  <div><strong>Withholding:</strong> Rs {Number(detail.invoice.withholding_tax).toFixed(2)}</div>
                  <div><strong>Income Tax Paid:</strong> Rs {Number(detail.invoice.income_tax_paid).toFixed(2)}</div>
                </Col>
              </Row>

              <Table responsive bordered className="table-darkish mb-0">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>HS</th>
                    <th className="text-end">Qty</th>
                    <th className="text-end">Retail</th>
                    <th className="text-end">Rate</th>
                    <th className="text-end">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((it, idx) => {
                    const lt = Number(it.quantity_sold) * Number(it.sale_rate);
                    return (
                      <tr key={idx}>
                        <td>{it.description}</td>
                        <td className="mono">{it.hs_code}</td>
                        <td className="text-end">{Number(it.quantity_sold)}</td>
                        <td className="text-end">Rs {Number(it.retail_price).toFixed(2)}</td>
                        <td className="text-end">Rs {Number(it.sale_rate).toFixed(2)}</td>
                        <td className="text-end">Rs {lt.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </>
          )}
        </Modal.Body>
      </Modal>

      {/* Styles */}
      <style>{`
        :root{
          --bg:#0d0d0d;
          --accent:#ff4c4c;
          --glass:rgba(169, 99, 99, 0.9);
          --border:rgba(255,76,76,0.35);
          --text:#f5f5f5;
          --muted:white;
        }
        .tax-report-page{
          position:relative; min-height:100vh; background:var(--bg); color:var(--text);
          padding: 1rem 0 2rem; overflow-x:hidden;
        }
        /* tightened background to avoid empty scroll space */
        .tax-report-page::before{
          content:""; position:absolute; inset:0;
          background: repeating-linear-gradient(120deg, rgba(255,76,76,.05) 0 2px, transparent 2px 20px);
          animation: moveBg 16s linear infinite; z-index:0; pointer-events:none;
        }
        @keyframes moveBg { to { transform: translate(-22%, -22%); } }
        .overlay{ position:absolute; inset:0; background: radial-gradient(1000px 600px at top left, rgba(255,76,76,.08), transparent 60%); z-index:1; pointer-events:none; }
        .title{ letter-spacing:1px; text-transform:uppercase; color:var(--accent); text-shadow:0 2px 10px rgba(255,76,76,.45); }
        .title-icon{ color:var(--accent); filter: drop-shadow(0 2px 10px rgba(255,76,76,.45)); }
        .controls .search-wrap{ display:flex; align-items:center; gap:.5rem; padding:.45rem .7rem; border:1px solid var(--border); border-radius:12px; background:rgba(255,255,255,0.06); }
        .search-wrap input{ background:transparent; border:none; outline:none; color:#fff; min-width:220px; }
        .search-icon{ color:var(--muted); }
        .glass{ color: #fff ;position:relative; z-index:2; background: var(--glass); border:1px solid var(--border); border-radius:16px; box-shadow:0 8px 24px rgba(255,76,76,.12); }
        .glass-soft{ border-color: rgba(255,255,255,.12); background: rgba(255,255,255,.03); }
        .table-darkish thead th{ background: rgba(84, 11, 11, 0.8); color:#fff; position:sticky; top:0; backdrop-filter: blur(10px); }
        .table-darkish tbody tr:hover{ background: rgba(255,255,255,.03); }
        .btn-ghost{ background: rgba(71, 14, 14, 0.86); border: 1px solid var(--border); color: #fff; }
        .btn-ghost:hover{ background: rgba(255,76,76,.15); border-color: var(--accent); }
        .mono{ font-family: ui-monospace, Menlo, Consolas, monospace; }
        .modal-dark{ background:#121218; color:#fff; border: 1px solid var(--border); }
      `}</style>
    </div>
  );
}
