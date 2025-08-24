// src/components/CustomerLedgerPage.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Container, Card, Row, Col, Form, Table, Button, Spinner, Modal, Alert, Badge
} from 'react-bootstrap';
import {
  FaBook, FaSearch, FaRedo, FaFileExport, FaInfoCircle
} from 'react-icons/fa';

const PAGE_SIZE = 30;

// Normalize one row for the ledger
// type: 'invoice' | 'payment' | 'return'
function makeRow({ ts, ref, desc, debit = 0, credit = 0, meta = {} }) {
  return {
    ts: ts ? new Date(ts) : null,
    ref, desc,
    debit: Number(debit || 0),
    credit: Number(credit || 0),
    meta
  };
}

export default function CustomerLedgerPage() {
  // Filters
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [textQ, setTextQ] = useState('');
  const searchRef = useRef(null);

  // Data
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]); // normalized ledger rows (mixed: invoices, payments, returns)
  const [openingBalance, setOpeningBalance] = useState(0);
  const [paymentsAvailable, setPaymentsAvailable] = useState(true); // flips to false if GET payments 404s

  // Drill-down invoice
  const [showInv, setShowInv] = useState(false);
  const [invTitle, setInvTitle] = useState('');
  const [invDetail, setInvDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);

  // Load customers for picker
  useEffect(() => {
    axios.get('/api/customers').then(r => setCustomers(r.data || [])).catch(() => setCustomers([]));
  }, []);

  // Fetch ledger
  const fetchLedger = async () => {
    if (!customerId) return;

    setLoading(true);
    setRows([]);
    setOpeningBalance(0);
    setPaymentsAvailable(true);

    try {
      // 1) Base: invoices (we already have /api/sales/invoices filterable)
      const invParams = {
        search: '',                 // we’ll filter by customer_id client-side
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      };
      const { data: invoices } = await axios.get('/api/sales/invoices', { params: invParams });

      // Keep only this customer's invoices
      const invRows = (Array.isArray(invoices) ? invoices : []).filter(r => Number(r.customer_id) === Number(customerId));

      // 2) Returns per invoice (optional enrichment)
      //    We’ll fetch for visible range; to keep it simple, do it sequentially but quickly.
      const returnMap = new Map(); // invoice_id -> total credit from returns inside range AND outside
      const returnRows = [];
      for (const inv of invRows) {
        try {
          const { data: ret } = await axios.get(`/api/sales/invoice/${inv.invoice_number}/returns`);
          const inRange = (ret || []).filter(rr => {
            const d = rr.created_at ? rr.created_at.slice(0,10) : null;
            return (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
          });

          const totalCredit = inRange.reduce((s, r) => s + Number(r.refund_amount || 0) + Number(r.tax_reversal || 0), 0);
          returnMap.set(inv.id, totalCredit);

          // push rows for each return event (credit)
          inRange.forEach(r => {
            const amt = Number(r.refund_amount || 0) + Number(r.tax_reversal || 0);
            returnRows.push(makeRow({
              ts: r.created_at,
              ref: r.return_number,
              desc: `Return (Invoice ${inv.invoice_number})`,
              credit: amt,
              meta: { type: 'return', invoice_number: inv.invoice_number }
            }));
          });
        } catch {
          // ignore
        }
      }

      // 3) Payments (best effort). Try a GET endpoint. If it 404s, we just skip payments.
      let payRows = [];
      try {
        const { data: payments } = await axios.get(`/api/payments/customer/${customerId}`, {
          params: { from: fromDate || undefined, to: toDate || undefined }
        });
        // Expect fields: date, type('received'|'paid'), amount, mode, invoice_id (optional), receipt_path (optional), remarks
        payRows = (payments || []).map(p => {
          // In a customer ledger:
          //  - 'received' from customer => CREDIT (reduces what they owe)
          //  - 'paid' to customer       => DEBIT  (we owe more to customer)
          const isReceived = p.type === 'received';
          const debit = isReceived ? 0 : Number(p.amount || 0);
          const credit = isReceived ? Number(p.amount || 0) : 0;
          const ref = p.invoice_id ? `Payment • Inv ${p.invoice_id}` : 'Payment';
          return makeRow({
            ts: p.date,
            ref,
            desc: `${p.mode?.toUpperCase?.() || p.mode} ${p.remarks ? `— ${p.remarks}` : ''}`,
            debit, credit,
            meta: { type: 'payment', receipt_path: p.receipt_path || null }
          });
        });
      } catch (err) {
        setPaymentsAvailable(false);
      }

      // 4) Invoice rows (debit), within date range
      const invRowsInRange = invRows.filter(inv => {
        const d = inv.created_at ? inv.created_at.slice(0,10) : null;
        return (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
      }).map(inv => makeRow({
        ts: inv.created_at,
        ref: inv.invoice_number,
        desc: `${inv.customer_name} — ${inv.tax_section} (${inv.filer_status})`,
        debit: Number(inv.gross_total || 0),
        credit: 0,
        meta: { type: 'invoice', invoice_number: inv.invoice_number }
      }));

      // 5) Opening balance (before fromDate)
      let opening = 0;
      if (fromDate) {
        // Invoices before fromDate => add debit
        const invBefore = invRows.filter(inv => (inv.created_at || '').slice(0,10) < fromDate)
          .reduce((s, inv) => s + Number(inv.gross_total || 0), 0);

        // Returns before fromDate => add credit
        let retBefore = 0;
        for (const inv of invRows) {
          try {
            const { data: ret } = await axios.get(`/api/sales/invoice/${inv.invoice_number}/returns`);
            retBefore += (ret || [])
              .filter(r => (r.created_at || '').slice(0,10) < fromDate)
              .reduce((s, r) => s + Number(r.refund_amount || 0) + Number(r.tax_reversal || 0), 0);
          } catch {}
        }

        // Payments before fromDate (best effort, only if endpoint exists)
        let payBefore = 0;
        if (paymentsAvailable) {
          try {
            const { data: pays } = await axios.get(`/api/payments/customer/${customerId}`, {
              params: { to: fromDate }
            });
            payBefore = (pays || []).reduce((s, p) => {
              const amt = Number(p.amount || 0);
              return s + (p.type === 'received' ? amt * -1 : amt * +1); // received reduces, paid increases
            }, 0);
          } catch {}
        }

        opening = invBefore - retBefore + payBefore;
      }
      setOpeningBalance(opening);

      // 6) Merge and sort ledger rows
      const all = [...invRowsInRange, ...returnRows, ...payRows]
        .filter(r => {
          if (!textQ.trim()) return true;
          const q = textQ.toLowerCase();
          return (r.ref || '').toLowerCase().includes(q) || (r.desc || '').toLowerCase().includes(q);
        })
        .sort((a, b) => (a.ts?.getTime?.() || 0) - (b.ts?.getTime?.() || 0));

      setRows(all);
      setPage(1);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh when filters change customer/date
  useEffect(() => {
    if (customerId) fetchLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, fromDate, toDate]);

  // Compute running balance & page data
  const withBalance = useMemo(() => {
    let bal = Number(openingBalance || 0);
    return rows.map(r => {
      bal = bal + r.debit - r.credit;
      return { ...r, balance: bal };
    });
  }, [rows, openingBalance]);

  const pageCount = Math.max(1, Math.ceil(withBalance.length / PAGE_SIZE));
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return withBalance.slice(start, start + PAGE_SIZE);
  }, [withBalance, page]);

  // Drill-down invoice
  const openInvoice = async (invoice_number, customer_name) => {
    setInvTitle(`${invoice_number} — ${customer_name || ''}`);
    setShowInv(true);
    setInvDetail(null);
    setDetailLoading(true);
    try {
      const { data } = await axios.get(`/api/sales/invoice/${invoice_number}`);
      setInvDetail(data || null);
    } catch {
      setInvDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // CSV export
  const exportCSV = () => {
    const headers = ['Date/Time', 'Ref', 'Description', 'Debit', 'Credit', 'Balance'];
    const lines = [headers.join(',')];
    lines.push(['OPENING BALANCE', '', '', '', '', openingBalance.toFixed(2)].join(','));
    withBalance.forEach(r => {
      lines.push([
        r.ts ? r.ts.toLocaleString() : '',
        (r.ref || '').replaceAll(',', ' '),
        (r.desc || '').replaceAll(',', ' '),
        r.debit.toFixed(2),
        r.credit.toFixed(2),
        r.balance.toFixed(2)
      ].join(','));
    });
    if (withBalance.length) {
      const closing = withBalance[withBalance.length - 1].balance;
      lines.push(['CLOSING BALANCE', '', '', '', '', closing.toFixed(2)].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `customer-ledger_${customerId}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // Keyboard: Ctrl/Cmd+F focus search, Enter refresh, arrows page
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'Enter') { e.preventDefault(); fetchLedger(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setPage(p => Math.min(pageCount, p + 1)); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setPage(p => Math.max(1, p - 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pageCount]);

  const selectedCustomer = customers.find(c => Number(c.id) === Number(customerId));

  return (
    <div className="cust-ledger-page">
      <div className="overlay" aria-hidden />
      <Container className="py-4">
        {/* Header */}
        <header className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
          <div className="d-flex align-items-center gap-2">
            <FaBook className="title-icon" />
            <h2 className="m-0 title">Customer Ledger</h2>
            {customerId && <Badge bg="dark" pill>#{customerId}</Badge>}
          </div>

        {/* Filters */}
          <div className="controls d-flex flex-wrap align-items-center gap-2">
            <Form.Select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              style={{ minWidth: 260 }}
              title="Customer"
            >
              <option value="">Select Customer</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.business_name})</option>
              ))}
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

            <div className="search-wrap">
              <FaSearch className="search-icon" />
              <input
                ref={searchRef}
                placeholder="Filter ref/description"
                value={textQ}
                onChange={(e) => setTextQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') fetchLedger(); }}
              />
            </div>

            <Button variant="outline-light" onClick={fetchLedger}><FaRedo /> Refresh</Button>
            <Button variant="outline-warning" onClick={exportCSV}><FaFileExport /> Export</Button>
          </div>
        </header>

        {/* Info banner if payments missing */}
        {!paymentsAvailable && (
          <Alert variant="warning" className="glass-soft">
            <FaInfoCircle />&nbsp; Payments endpoint not available — showing invoices and returns only.
            (Optional: add <code>GET /api/payments/customer/:id?from&to</code> to include payments rows.)
          </Alert>
        )}

        {/* Summary */}
        <Card className="glass mb-3">
          <Card.Body>
            <Row className="g-2">
              <Col md={3}><Stat label="Opening Balance" value={openingBalance} prefix="Rs " /></Col>
              <Col md={3}><Stat label="Debits (Invoices + Paid)" value={rows.reduce((s,r)=>s+(r.debit||0),0)} prefix="Rs " /></Col>
              <Col md={3}><Stat label="Credits (Payments Recv + Returns)" value={rows.reduce((s,r)=>s+(r.credit||0),0)} prefix="Rs " /></Col>
              <Col md={3}>
                <Stat
                  label="Closing Balance"
                  value={withBalance.length ? withBalance[withBalance.length-1].balance : openingBalance}
                  prefix="Rs "
                  bold
                />
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {/* Ledger table */}
        <Card className="glass">
          <Card.Header className="bg-transparent border-0 d-flex justify-content-between align-items-center">
            <strong>Ledger {selectedCustomer ? `— ${selectedCustomer.name}` : ''}</strong>
            <div className="small text-muted">
              Page {page}/{pageCount} • Use ←/→ for pages • Enter to refresh • Ctrl/⌘+F to focus text filter
            </div>
          </Card.Header>
          <Card.Body className="p-0">
            <Table responsive hover className="table-darkish mb-0">
              <thead>
                <tr>
                  <th style={{minWidth:160}}>Date/Time</th>
                  <th>Ref</th>
                  <th>Description</th>
                  <th className="text-end">Debit</th>
                  <th className="text-end">Credit</th>
                  <th className="text-end">Balance</th>
                  <th className="text-center">View</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening row */}
                <tr className="row-open">
                  <td colSpan={5}><em>Opening Balance</em></td>
                  <td className="text-end fw-bold">Rs {Number(openingBalance).toFixed(2)}</td>
                  <td />
                </tr>

                {loading ? (
                  <tr><td colSpan={7} className="text-center py-5"><Spinner animation="border" /></td></tr>
                ) : paged.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-4">No entries.</td></tr>
                ) : (
                  paged.map((r, i) => {
                    const isInv = r.meta?.type === 'invoice';
                    const isPay = r.meta?.type === 'payment';
                    const isRet = r.meta?.type === 'return';
                    return (
                      <tr key={`${r.ref}-${i}`} className={isInv ? 'row-inv' : isPay ? 'row-pay' : isRet ? 'row-ret' : ''}>
                        <td>{r.ts ? r.ts.toLocaleString() : ''}</td>
                        <td className="mono">{r.ref}</td>
                        <td>{r.desc}</td>
                        <td className="text-end">{r.debit ? `Rs ${r.debit.toFixed(2)}` : ''}</td>
                        <td className="text-end">{r.credit ? `Rs ${r.credit.toFixed(2)}` : ''}</td>
                        <td className="text-end fw-bold">Rs {Number(r.balance).toFixed(2)}</td>
                        <td className="text-center">
                          {isInv ? (
                            <Button size="sm" className="btn-ghost" onClick={() => openInvoice(r.meta.invoice_number, selectedCustomer?.name)}>Invoice</Button>
                          ) : isPay && r.meta?.receipt_path ? (
                            <a className="btn btn-sm btn-ghost" href={r.meta.receipt_path} target="_blank" rel="noreferrer">Receipt</a>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
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
            <span className="small text-muted">Showing {paged.length} of {withBalance.length} rows</span>
            <div className="d-flex align-items-center gap-2">
              <Button
                variant="outline-light" size="sm"
                disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
              >◀ Prev</Button>
              <span className="small mono">{page} / {pageCount}</span>
              <Button
                variant="outline-light" size="sm"
                disabled={page >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}
              >Next ▶</Button>
            </div>
          </Card.Footer>
        </Card>
      </Container>

      {/* Invoice detail modal */}
      <Modal show={showInv} onHide={() => setShowInv(false)} size="lg" centered contentClassName="modal-dark">
        <Modal.Header closeButton>
          <Modal.Title>Invoice — {invTitle}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {detailLoading ? (
            <div className="text-center py-4"><Spinner animation="border" /></div>
          ) : !invDetail ? (
            <div className="text-center py-4">Failed to load invoice.</div>
          ) : (
            <>
              <Row className="mb-3">
                <Col md={6}>
                  <div><strong>Customer:</strong> {invDetail.invoice.customer_name}</div>
                  <div><strong>Section:</strong> {invDetail.invoice.tax_section}</div>
                </Col>
                <Col md={6} className="text-md-end">
                  <div><strong>Gross:</strong> Rs {Number(invDetail.invoice.gross_total).toFixed(2)}</div>
                  <div><strong>Sales Tax:</strong> Rs {Number(invDetail.invoice.sales_tax).toFixed(2)}</div>
                  <div><strong>Withholding:</strong> Rs {Number(invDetail.invoice.withholding_tax).toFixed(2)}</div>
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
                  {invDetail.items.map((it, idx) => {
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
          --glass:rgba(255,255,255,0.06);
          --border:rgba(255,76,76,0.35);
          --text:#f5f5f5;
          --muted:#bdbdbd;
        }
        .cust-ledger-page{ position:relative; min-height:100vh; background:var(--bg); color:var(--text); padding: 1rem 0 2rem; }
        .cust-ledger-page::before{
          content:""; position:absolute; inset:-100%;
          background: repeating-linear-gradient(120deg, rgba(255,76,76,.05) 0 2px, transparent 2px 20px);
          animation: moveBg 16s linear infinite; z-index:0;
        }
        @keyframes moveBg { to { transform: translate(-22%, -22%); } }
        .overlay{ position:absolute; inset:0; background: radial-gradient(1000px 600px at top left, rgba(255,76,76,.08), transparent 60%); z-index:1; }
        .title{ letter-spacing:1px; text-transform:uppercase; color:var(--accent); text-shadow:0 2px 10px rgba(255,76,76,.45); }
        .title-icon{ color:var(--accent); filter: drop-shadow(0 2px 10px rgba(255,76,76,.45)); }
        .controls .search-wrap{ display:flex; align-items:center; gap:.5rem; padding:.45rem .7rem; border:1px solid var(--border); border-radius:12px; background:rgba(255,255,255,0.06); }
        .search-wrap input{ background:transparent; border:none; outline:none; color:#fff; min-width:220px; }
        .search-icon{ color:var(--muted); }
        .glass{ position:relative; z-index:2; background: var(--glass); border:1px solid var(--border); border-radius:16px; box-shadow:0 8px 24px rgba(255,76,76,.12); }
        .glass-soft{ border-color: rgba(255,255,255,.12); background: rgba(255,255,255,.03); }
        .table-darkish thead th{ background: rgba(84, 11, 11, 0.8); color:#fff; position:sticky; top:0; backdrop-filter: blur(10px); }
        .table-darkish tbody tr:hover{ background: rgba(255,255,255,.03); }
        .row-open{ background: rgba(255,255,255,.02); }
        .row-inv{ background: rgba(255,76,76,.04); }
        .row-pay{ background: rgba(255,255,255,.02); }
        .row-ret{ background: rgba(59, 124, 59, .08); }
        .btn-ghost{ background: rgba(71, 14, 14, 0.86); border: 1px solid var(--border); color: #fff; }
        .btn-ghost:hover{ background: rgba(255,76,76,.15); border-color: var(--accent); }
        .mono{ font-family: ui-monospace, Menlo, Consolas, monospace; }
        .modal-dark{ background:#121218; color:#fff; border: 1px solid var(--border); }
      `}</style>
    </div>
  );
}

function Stat({ label, value, prefix = '', bold = false }) {
  return (
    <Card className="mini glass-soft">
      <Card.Body className="py-2">
        <div className="text-muted small">{label}</div>
        <div className={`fs-5 ${bold ? 'fw-bold' : ''}`}>{prefix}{Number(value || 0).toFixed(2)}</div>
      </Card.Body>
    </Card>
  );
}
