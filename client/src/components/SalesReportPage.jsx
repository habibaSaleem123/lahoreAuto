// src/components/SalesReportPage.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Container, Card, Row, Col, Form, Table, Button, Spinner, Badge, Modal
} from 'react-bootstrap';
import {
  FaSearch, FaSyncAlt, FaFilter, FaDownload, FaEye, FaMoneyCheckAlt, FaCheckCircle
} from 'react-icons/fa';

const PAGE_SIZE = 25;

export default function SalesReportPage() {
  // Filters
  const [search, setSearch] = useState('');
  const [taxSection, setTaxSection] = useState('');          // '', '236G', '236H'
  const [filerStatus, setFilerStatus] = useState('all');     // 'all' | 'filer' | 'non-filer'
  const [paymentStatus, setPaymentStatus] = useState('');    // '', 'paid', 'unpaid'
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Data
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // Selection / paging
  const [selected, setSelected] = useState(new Set()); // invoice_numbers
  const [page, setPage] = useState(1);

  // Drill-down modal
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceHeader, setInvoiceHeader] = useState(null);
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  // Mark-paid modal
  const [showPaid, setShowPaid] = useState(false);
  const [paidForm, setPaidForm] = useState({
    invoice_number: '',
    payer_name: '',
    bank_name: '',
    payment_date: new Date().toISOString().slice(0,10),
    receipt: null
  });

  // Keyboard helpers
  const tableRef = useRef(null);
  const [highlight, setHighlight] = useState(0); // index within current page
  const searchRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/sales/invoices', {
        params: {
          search,
          tax_section: taxSection,
          filer_status: filerStatus,
          payment_status: paymentStatus,
          from_date: fromDate || undefined,
          to_date: toDate || undefined
        }
      });
      setRows(Array.isArray(data) ? data : []);
      setPage(1);
      setHighlight(0);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, taxSection, filerStatus, paymentStatus, fromDate, toDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Paging
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

  // Totals (for current filter result)
  const totals = useMemo(() => {
    let gross = 0, st = 0, wht = 0, it = 0, paid = 0, count = rows.length;
    for (const r of rows) {
      gross += Number(r.gross_total || 0);
      st    += Number(r.sales_tax   || 0);
      wht   += Number(r.withholding_tax || 0);
      it    += Number(r.income_tax_paid || 0);
      if (r.is_paid) paid++;
    }
    return { gross, st, wht, it, paid, count };
  }, [rows]);

  const toggleSelect = (inv) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(inv)) next.delete(inv); else next.add(inv);
      return next;
    });
  };
  const allOnPageSelected = pageRows.every(r => selected.has(r.invoice_number));
  const toggleSelectPage = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allOnPageSelected) pageRows.forEach(r => next.delete(r.invoice_number));
      else pageRows.forEach(r => next.add(r.invoice_number));
      return next;
    });
  };

  const openInvoice = async (invoice_number) => {
    setShowInvoice(true);
    setInvoiceHeader(null);
    setInvoiceItems([]);
    setInvoiceLoading(true);
    try {
      const { data } = await axios.get(`/api/sales/invoice/${invoice_number}`);
      setInvoiceHeader(data.invoice);
      setInvoiceItems(data.items || []);
    } catch {
      // ignore
    } finally {
      setInvoiceLoading(false);
    }
  };

  const exportSelectedToFBR = async () => {
    if (selected.size === 0) return;
    try {
      const { data } = await axios.post('/api/sales/export-fbr', { invoice_numbers: [...selected] }, { responseType: 'blob' });
      // Download blob
      const url = URL.createObjectURL(new Blob([data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'FBR_Export.xlsm';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed');
    }
  };

  const openMarkPaid = (invoice_number) => {
    setPaidForm(f => ({ ...f, invoice_number }));
    setShowPaid(true);
  };

  const submitMarkPaid = async () => {
    const { invoice_number, payer_name, bank_name, payment_date, receipt } = paidForm;
    const form = new FormData();
    form.append('payer_name', payer_name);
    form.append('bank_name', bank_name);
    form.append('payment_date', payment_date);
    if (receipt) form.append('receipt', receipt);
    try {
      await axios.post(`/api/sales/invoice/${invoice_number}/mark-paid`, form);
      setShowPaid(false);
      fetchData();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to mark paid');
    }
  };

  // Keyboard: arrows to move highlight; Enter to open; / to focus search
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (['input','select','textarea'].includes(tag)) return;

      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight(h => Math.min(h + 1, pageRows.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight(h => Math.max(h - 1, 0));
      } else if (e.key === 'ArrowRight') {
        if (page < totalPages) { e.preventDefault(); setPage(p => p + 1); setHighlight(0); }
      } else if (e.key === 'ArrowLeft') {
        if (page > 1) { e.preventDefault(); setPage(p => p - 1); setHighlight(0); }
      } else if (e.key === 'Enter') {
        const row = pageRows[highlight];
        if (row) { e.preventDefault(); openInvoice(row.invoice_number); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pageRows, highlight, page, totalPages]);

  return (
    <div className="sales-report-page">
      <div className="overlay" aria-hidden />
      <Container className="py-4">
        {/* Header + Filters */}
        <header className="d-grid header-grid">
          <div className="left">
            <h2 className="title m-0">🧾 Sales Report</h2>
            <div className="muted small">/ to focus search • ↑/↓ move • Enter open • ←/→ page</div>
          </div>

          <div className="filters glass p-2">
            <Row className="g-2 align-items-end">
              <Col md={4}>
                <div className="search-wrap">
                  <FaSearch className="search-icon" />
                  <input
                    ref={searchRef}
                    placeholder="Search by customer or invoice #"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') fetchData(); }}
                  />
                </div>
              </Col>
              <Col xs={6} md={2}>
                <Form.Label className="form-label-tight">Tax Section</Form.Label>
                <Form.Select value={taxSection} onChange={(e)=>setTaxSection(e.target.value)}>
                  <option value="">All</option>
                  <option value="236G">236G</option>
                  <option value="236H">236H</option>
                </Form.Select>
              </Col>
              <Col xs={6} md={2}>
                <Form.Label className="form-label-tight">Filer</Form.Label>
                <Form.Select value={filerStatus} onChange={(e)=>setFilerStatus(e.target.value)}>
                  <option value="all">All</option>
                  <option value="filer">Filer</option>
                  <option value="non-filer">Non-Filer</option>
                </Form.Select>
              </Col>
              <Col xs={6} md={2}>
                <Form.Label className="form-label-tight">Payment</Form.Label>
                <Form.Select value={paymentStatus} onChange={(e)=>setPaymentStatus(e.target.value)}>
                  <option value="">All</option>
                  <option value="paid">Paid</option>
                  <option value="unpaid">Unpaid</option>
                </Form.Select>
              </Col>
              <Col xs={6} md={2}>
                <Form.Label className="form-label-tight">From</Form.Label>
                <Form.Control type="date" value={fromDate} onChange={(e)=>setFromDate(e.target.value)} />
              </Col>
              <Col xs={6} md={2}>
                <Form.Label className="form-label-tight">To</Form.Label>
                <Form.Control type="date" value={toDate} onChange={(e)=>setToDate(e.target.value)} />
              </Col>

              <Col md="auto" className="d-flex gap-2">
                <Button variant="outline-light" onClick={fetchData} disabled={loading}>
                  {loading ? <Spinner size="sm" animation="border" /> : <><FaFilter className="me-1" /> Apply</>}
                </Button>
                <Button variant="outline-light" onClick={() => {
                  setSearch(''); setTaxSection(''); setFilerStatus('all'); setPaymentStatus('');
                  setFromDate(''); setToDate(''); fetchData();
                }}>
                  <FaSyncAlt className="me-1" /> Reset
                </Button>
              </Col>
            </Row>
          </div>
        </header>

        {/* Totals */}
        <Row className="g-3 mb-3">
          <Col md={3}>
            <Card className="kpi glass">
              <Card.Body>
                <div className="kpi-label">Invoices</div>
                <div className="kpi-value">{totals.count}</div>
                <div className="kpi-sub"><Badge bg="success">{totals.paid} paid</Badge></div>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card className="kpi glass"><Card.Body>
              <div className="kpi-label">Gross Total</div>
              <div className="kpi-value">Rs {totals.gross.toFixed(2)}</div>
            </Card.Body></Card>
          </Col>
          <Col md={3}>
            <Card className="kpi glass"><Card.Body>
              <div className="kpi-label">Sales Tax</div>
              <div className="kpi-value">Rs {totals.st.toFixed(2)}</div>
            </Card.Body></Card>
          </Col>
          <Col md={3}>
            <Card className="kpi glass"><Card.Body>
              <div className="kpi-label">Withholding</div>
              <div className="kpi-value">Rs {totals.wht.toFixed(2)}</div>
            </Card.Body></Card>
          </Col>
        </Row>

        {/* Toolbar */}
        <div className="d-flex align-items-center justify-content-between mb-2">
          <small className="muted">Showing {rows.length ? ( (page-1)*PAGE_SIZE + 1 ) : 0}–{Math.min(page*PAGE_SIZE, rows.length)} of {rows.length}</small>
          <div className="d-flex gap-2">
            <Button
              variant="outline-light"
              disabled={selected.size === 0}
              onClick={exportSelectedToFBR}
              title="Export selected invoices to FBR template"
            >
              <FaDownload className="me-1" /> Export FBR ({selected.size})
            </Button>
          </div>
        </div>

        {/* Table */}
        <Card className="glass">
          <Card.Body className="p-0">
            <Table responsive hover className="table-darkish mb-0" ref={tableRef}>
              <thead>
                <tr>
                  <th style={{width:36}}>
                    <Form.Check type="checkbox" checked={allOnPageSelected} onChange={toggleSelectPage} />
                  </th>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Section</th>
                  <th>Filer</th>
                  <th>Date</th>
                  <th className="text-end">Gross</th>
                  <th className="text-end">Sales Tax</th>
                  <th className="text-end">Withholding</th>
                  <th className="text-end">Income Tax Paid</th>
                  <th>Status</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={12} className="text-center py-5"><Spinner animation="border" /></td></tr>
                ) : pageRows.length === 0 ? (
                  <tr><td colSpan={12} className="text-center py-4">No invoices.</td></tr>
                ) : pageRows.map((r, i) => {
                  const active = i === highlight;
                  return (
                    <tr
                      key={r.invoice_number}
                      className={active ? 'row-active' : ''}
                      onMouseEnter={() => setHighlight(i)}
                    >
                      <td>
                        <Form.Check
                          type="checkbox"
                          checked={selected.has(r.invoice_number)}
                          onChange={() => toggleSelect(r.invoice_number)}
                          onClick={(e)=>e.stopPropagation()}
                        />
                      </td>
                      <td className="mono">{r.invoice_number}</td>
                      <td>{r.customer_name}</td>
                      <td>{r.tax_section || '-'}</td>
                      <td>{r.filer_status || '-'}</td>
                      <td>{r.created_at ? new Date(r.created_at).toLocaleString() : '-'}</td>
                      <td className="text-end">Rs {Number(r.gross_total || 0).toFixed(2)}</td>
                      <td className="text-end">Rs {Number(r.sales_tax || 0).toFixed(2)}</td>
                      <td className="text-end">Rs {Number(r.withholding_tax || 0).toFixed(2)}</td>
                      <td className="text-end">Rs {Number(r.income_tax_paid || 0).toFixed(2)}</td>
                      <td>
                        {r.is_paid
                          ? <Badge bg="success"><FaCheckCircle className="me-1" /> Paid</Badge>
                          : <Badge bg="warning" text="dark">Unpaid</Badge>}
                      </td>
                      <td className="text-end">
                        <div className="d-flex justify-content-end gap-2">
                          <Button size="sm" className="btn-ghost" onClick={() => openInvoice(r.invoice_number)}>
                            <FaEye className="me-1" /> View
                          </Button>
                          {!r.is_paid && (
                            <Button size="sm" variant="outline-success" onClick={() => openMarkPaid(r.invoice_number)}>
                              <FaMoneyCheckAlt className="me-1" /> Mark Paid
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card.Body>
        </Card>

        {/* Pagination */}
        <div className="d-flex align-items-center justify-content-between mt-2">
          <div className="muted small">Page {page} / {totalPages}</div>
          <div className="d-flex gap-2">
            <Button variant="outline-light" disabled={page<=1} onClick={()=>{ setPage(p=>p-1); setHighlight(0); }}>Prev</Button>
            <Button variant="outline-light" disabled={page>=totalPages} onClick={()=>{ setPage(p=>p+1); setHighlight(0); }}>Next</Button>
          </div>
        </div>
      </Container>

      {/* Invoice Modal */}
      <Modal show={showInvoice} onHide={() => setShowInvoice(false)} size="lg" centered contentClassName="modal-dark">
        <Modal.Header closeButton>
          <Modal.Title>
            Invoice {invoiceHeader?.invoice_number} — {invoiceHeader?.customer_name}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {invoiceLoading ? (
            <div className="py-4 text-center"><Spinner animation="border" /></div>
          ) : !invoiceHeader ? (
            <div className="py-3 text-center">Not found</div>
          ) : (
            <>
              <Row className="mb-3">
                <Col sm={6}><div><b>Tax Section:</b> {invoiceHeader.tax_section}</div></Col>
                <Col sm={6}><div><b>Filer:</b> {invoiceHeader.filer_status}</div></Col>
              </Row>
              <Table bordered responsive className="table-darkish">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>HS</th>
                    <th className="text-end">Qty</th>
                    <th className="text-end">Rate</th>
                    <th className="text-end">Line Total</th>
                    <th className="text-end">GD</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceItems.map((it,i) => (
                    <tr key={i}>
                      <td>{it.description}</td>
                      <td>{it.hs_code}</td>
                      <td className="text-end">{Number(it.quantity_sold || 0)}</td>
                      <td className="text-end">Rs {Number(it.sale_rate || 0).toFixed(2)}</td>
                      <td className="text-end">Rs {Number(it.gross_line_total || 0).toFixed(2)}</td>
                      <td className="text-end">{it.gd_entry_id}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <div className="d-flex justify-content-end gap-3">
                <div><b>Gross:</b> Rs {Number(invoiceHeader.gross_total || 0).toFixed(2)}</div>
                <div><b>Sales Tax:</b> Rs {Number(invoiceHeader.sales_tax || 0).toFixed(2)}</div>
                <div><b>WHT:</b> Rs {Number(invoiceHeader.withholding_tax || 0).toFixed(2)}</div>
              </div>
            </>
          )}
        </Modal.Body>
      </Modal>

      {/* Mark Paid Modal */}
      <Modal show={showPaid} onHide={() => setShowPaid(false)} centered contentClassName="modal-dark">
        <Modal.Header closeButton><Modal.Title>Mark Invoice Paid</Modal.Title></Modal.Header>
        <Modal.Body>
          <Row className="g-2">
            <Col md={6}>
              <Form.Label>Payer Name</Form.Label>
              <Form.Control value={paidForm.payer_name} onChange={(e)=>setPaidForm(f=>({...f, payer_name: e.target.value}))} />
            </Col>
            <Col md={6}>
              <Form.Label>Bank</Form.Label>
              <Form.Control value={paidForm.bank_name} onChange={(e)=>setPaidForm(f=>({...f, bank_name: e.target.value}))} />
            </Col>
            <Col md={6}>
              <Form.Label>Date</Form.Label>
              <Form.Control type="date" value={paidForm.payment_date} onChange={(e)=>setPaidForm(f=>({...f, payment_date: e.target.value}))} />
            </Col>
            <Col md={6}>
              <Form.Label>Receipt (optional)</Form.Label>
              <Form.Control type="file" accept="image/*,application/pdf" onChange={(e)=>setPaidForm(f=>({...f, receipt: e.target.files?.[0] || null}))} />
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={()=>setShowPaid(false)}>Cancel</Button>
          <Button variant="success" onClick={submitMarkPaid}>Save</Button>
        </Modal.Footer>
      </Modal>

      {/* Styles */}
      <style>{`
        :root{
          --bg:#0d0d0d; --accent:#ff4c4c; --glass:rgba(39, 9, 9, 0.79);
          --border:rgba(255,76,76,0.35); --text:#f5f5f5; --muted:#bdbdbd;
        }
        .sales-report-page{
          position:relative; min-height:100vh; background:var(--bg); color:var(--text);
          /* prevents horizontal scroll jiggle on sticky header */
          overflow-x: hidden;
        }
        .sales-report-page::before{
          content:""; position:absolute; inset:0;                 /* ⬅️ was -100% */
          background: repeating-linear-gradient(120deg, rgba(255,76,76,.05) 0 2px, transparent 2px 20px);
          animation: moveBg 16s linear infinite; z-index:0;
          pointer-events: none;                                   /* ⬅️ add */
        }
        @keyframes moveBg { to { transform: translate(-22%, -22%); } }

        .overlay{
          position:absolute; inset:0;
          background: radial-gradient(1000px 600px at top left, rgba(255,76,76,.08), transparent 60%);
          z-index:1; pointer-events:none;                         /* ⬅️ add pointer-events */
        }

        .title{ letter-spacing:.8px; text-transform:uppercase; color:var(--accent); text-shadow:0 2px 10px rgba(255,76,76,.45); }
        .muted{ color: var(--muted); }
        .glass{ position:relative; z-index:2; background: var(--glass); border:1px solid var(--border); border-radius:16px; box-shadow:0 8px 24px rgba(255,76,76,.12); }
        .header-grid{ grid-template-columns: 1fr; gap: .75rem; }
        .filters{ border-radius: 14px; }
        .search-wrap{ display:flex; align-items:center; gap:.5rem; padding:.45rem .7rem; border:1px solid var(--border); border-radius:12px; background:rgba(255,255,255,0.06); }
        .search-wrap input{ background:transparent; border:none; outline:none; color:#fff; width:100%; }
        .search-icon{ color:var(--muted); }
        .kpi .kpi-label{ font-size:.9rem; color:#ffd0d0; }
        .kpi .kpi-value{ font-size:1.2rem; font-weight:800; color:#fff; }
        .table-darkish thead th{ background: rgba(84, 11, 11, 0.8); color:#fff; position:sticky; top:0; backdrop-filter: blur(10px); }
        .table-darkish tbody tr:hover{ background: rgba(255,255,255,.03); }
        .btn-ghost{ background: rgba(71, 14, 14, 0.86); border: 1px solid var(--border); color: #fff; }
        .btn-ghost:hover{ background: rgba(255,76,76,.15); border-color: var(--accent); }
        .row-active{ box-shadow: inset 0 0 0 100vmax rgba(255,76,76,.07); }
        .mono{ font-family: ui-monospace, Menlo, Consolas, monospace; }
        .form-label-tight{ font-size:.8rem; color:#fff; opacity:.9; }
        .modal-dark{ background:#121218; color:#fff; border: 1px solid var(--border); }
      `}</style>
    </div>
  );
}
