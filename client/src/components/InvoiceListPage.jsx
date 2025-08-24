import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Table as RBTable, Button as RBButton, Form, Row, Col, Container, Modal } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
// 🔧 Add API base + helper to build absolute URLs for receipts
const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
const asAbs = (p) => {
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;                    // already absolute
  // 👇 Normalize legacy values like "receipts/..." to "/uploads/receipts/..."
  let webPath = p.startsWith('/') ? p : `/${p}`;
  if (webPath.startsWith('/receipts/')) webPath = `/uploads${webPath}`;
  if (webPath.startsWith('/payments/')) webPath = `/uploads${webPath}`;
  return `${API_BASE}${webPath}`;
};
/* Optional: if you have PageShell/Panel from earlier, uncomment these and
   replace the outer <div className="page-shell"> wrapper with <PageShell title="Invoices">,
   and wrap inner content with <div className="page-content">...</div> or a <Panel>.
*/
// import PageShell from '../components/ui/PageShell';
// import { Panel } from '../components/ui/Surfaces';

const InvoiceListPage = () => {
  const [invoices, setInvoices] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState({
    tax_section: '',
    filer_status: 'all',
    from_date: '',
    to_date: '',
    payment_status: ''
  });
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedToPay, setSelectedToPay] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    bank_name: '',
    payer_name: '',
    payment_date: '',
    receipt: null
  });

  const navigate = useNavigate();

  const fetchInvoices = async () => {
    const res = await axios.get('/api/sales/invoices', { params: { search, ...filter } });
    setInvoices(res.data);
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const toggleSelection = (invoice_number) => {
    setSelectedInvoices(prev =>
      prev.includes(invoice_number)
        ? prev.filter(i => i !== invoice_number)
        : [...prev, invoice_number]
    );
  };

  const selectAll = () => {
    setSelectedInvoices(invoices.map(inv => inv.invoice_number));
  };

  const exportToFBR = async () => {
    const res = await axios.post(
      '/api/sales/export-fbr',
      { invoice_numbers: selectedInvoices },
      { responseType: 'blob' }
    );
    const today = new Date().toISOString().split("T")[0];
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${today}_FBR_Export_Invoices.xlsm`);
    document.body.appendChild(link);
    link.click();
  };

  const handleDelete = async (invoice_number) => {
    if (window.confirm('Are you sure you want to delete this invoice?')) {
      await axios.delete(`/api/sales/invoice/${invoice_number}`);
      fetchInvoices();
    }
  };

  const openPayModal = (inv) => {
    setSelectedToPay(inv.invoice_number);
    setPaymentForm({
      bank_name: '',
      payer_name: '',
      payment_date: new Date().toISOString().split("T")[0],
      receipt: null
    });
    setShowPayModal(true);
  };

  const handleMarkPaid = async () => {
    const formData = new FormData();
    formData.append('bank_name', paymentForm.bank_name);
    formData.append('payer_name', paymentForm.payer_name);
    formData.append('payment_date', paymentForm.payment_date);
    if (paymentForm.receipt) formData.append('receipt', paymentForm.receipt);

    try {
      await axios.post(`/api/sales/invoice/${selectedToPay}/mark-paid`, formData);
      toast.success('✅ Invoice marked as paid!');
      setShowPayModal(false);
      fetchInvoices();
    } catch (err) {
      toast.error('❌ Failed to mark as paid');
    }
  };

  return (
    <div className="page-shell">
      <div className="page-overlay" />
      <h2 className="page-title">Invoices</h2>

      <div className="page-content">
        <div className="glass-card panel">
          <div className="panel-header">
            <h3>📄 Invoice Log</h3>
            <div className="panel-actions">
              <button
                className="btn btn--ghost"
                onClick={selectAll}
                title="Select all invoices in the list"
              >
                Select All
              </button>
              <button
                className="btn btn--primary"
                disabled={!selectedInvoices.length}
                onClick={exportToFBR}
                title="Export selected invoices to FBR"
              >
                📤 Export Selected
              </button>
            </div>
          </div>

          <ToastContainer position="top-center" />

          {/* Filters */}
          <div className="filters-grid">
            <input
              className="input"
              placeholder="Search customer or invoice"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select
              className="input"
              value={filter.tax_section}
              onChange={e => setFilter(f => ({ ...f, tax_section: e.target.value }))}
            >
              <option value="">All Sections</option>
              <option value="236G">236G</option>
              <option value="236H">236H</option>
            </select>
            <select
              className="input"
              value={filter.filer_status}
              onChange={e => setFilter(f => ({ ...f, filer_status: e.target.value }))}
            >
              <option value="all">All Filers</option>
              <option value="filer">Filer</option>
              <option value="non-filer">Non-Filer</option>
            </select>
            <select
              className="input"
              value={filter.payment_status}
              onChange={e => setFilter(f => ({ ...f, payment_status: e.target.value }))}
            >
              <option value="">All</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
            <input
              className="input"
              type="date"
              value={filter.from_date}
              onChange={e => setFilter(f => ({ ...f, from_date: e.target.value }))}
            />
            <input
              className="input"
              type="date"
              value={filter.to_date}
              onChange={e => setFilter(f => ({ ...f, to_date: e.target.value }))}
            />
            <button className="btn btn--ghost" onClick={fetchInvoices}>🔍 Apply</button>
          </div>

          {/* Table */}
          <div className="table-wrap">
            <table className="table glass-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>GD</th>
                  <th>Tax Section</th>
                  <th>Filer</th>
                  <th>Gross</th>
                  <th>Withholding</th>
                  <th>Profit</th>
                  <th>Status</th>
                  <th style={{ minWidth: 180 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.invoice_number}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedInvoices.includes(inv.invoice_number)}
                        onChange={() => toggleSelection(inv.invoice_number)}
                      />
                    </td>
                    <td>{inv.invoice_number}</td>
                    <td>{inv.customer_name}</td>
                    <td>{inv.gd_entry_id}</td>
                    <td>{inv.tax_section}</td>
                    <td>{inv.filer_status === 'filer' ? 'Filer' : 'Non-Filer'}</td>
                    <td>Rs {inv.gross_total}</td>
                    <td>Rs {inv.withholding_tax}</td>
                    <td>Rs {inv.gross_profit}</td>
                    <td>
                      {inv.is_paid ? (
                        <div className="paid-badge">
                          ✅ Paid<br />
                          <small>{inv.payment_date && new Date(inv.payment_date).toLocaleDateString()}</small><br />
                          {inv.payer_name && <small>by {inv.payer_name}</small>}<br />
                          {inv.payment_bank && <small>via {inv.payment_bank}</small>}<br />
                          {inv.paid_receipt_path && (
                            <a
                              className="receipt-link"
                              href={asAbs(inv.paid_receipt_path)}

                              target="_blank" rel="noopener noreferrer"
                            >📄 View Receipt</a>
                          )}
                        </div>
                      ) : (
                        <span className="unpaid-badge">❌ Unpaid</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="btn btn--ghost btn--sm"
                          onClick={() => navigate(`/invoice/${inv.invoice_number}`)}
                        >
                          View
                        </button>
                        {!inv.is_paid && (
                          <button
                            className="btn btn--primary btn--sm"
                            onClick={() => openPayModal(inv)}
                          >
                            Mark Paid
                          </button>
                        )}
                        <button
                          className="btn btn--danger-outline btn--sm"
                          onClick={() => handleDelete(inv.invoice_number)}
                          disabled={inv.is_paid}
                          title={inv.is_paid ? "Can't delete a paid invoice" : "Delete invoice"}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!invoices.length && (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', opacity: .8, padding: '2rem' }}>
                      No invoices found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal (kept React-Bootstrap for behavior, themed via classes) */}
        <Modal
          show={showPayModal}
          onHide={() => setShowPayModal(false)}
          centered
          dialogClassName="glass-modal"
          contentClassName="glass-modal-content"
          backdropClassName="glass-modal-backdrop"
        >
          <Modal.Header closeButton>
            <Modal.Title>Mark Invoice as Paid</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="form-grid">
              <label>
                <span>Bank Name</span>
                <input
                  className="input"
                  value={paymentForm.bank_name}
                  onChange={e => setPaymentForm(f => ({ ...f, bank_name: e.target.value }))}
                />
              </label>
              <label>
                <span>Payer Name</span>
                <input
                  className="input"
                  value={paymentForm.payer_name}
                  onChange={e => setPaymentForm(f => ({ ...f, payer_name: e.target.value }))}
                />
              </label>
              <label>
                <span>Payment Date</span>
                <input
                  className="input"
                  type="date"
                  value={paymentForm.payment_date}
                  onChange={e => setPaymentForm(f => ({ ...f, payment_date: e.target.value }))}
                />
              </label>
              <label className="full">
                <span>Receipt (PDF/Image)</span>
                <input
                  className="input"
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={e => setPaymentForm(f => ({ ...f, receipt: e.target.files[0] }))}
                />
              </label>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <button className="btn btn--ghost" onClick={() => setShowPayModal(false)}>Cancel</button>
            <button className="btn btn--primary" onClick={handleMarkPaid}>Mark Paid</button>
          </Modal.Footer>
        </Modal>
      </div>

      <style>{`
  :root {
    --bg: hsl(0, 13.3%, 5.9%);
    --text: #222; /* dark text for better contrast on white */
    --accent: rgb(169, 74, 74);
    --glass-bg: rgba(255, 255, 255, 0.95); /* whitish container */
    --glass-border: rgba(82, 24, 24, 0.3);
    --glass-hover: rgba(111, 70, 70, 0.08);
    --radius-lg: 15px;
    --shadow-sm: 0 8px 20px rgba(0,0,0,.05);
    --shadow-lg: 0 12px 25px rgba(0,0,0,.15);
    --title-shadow: 0 2px 10px rgba(255, 76, 76, 0.5);
    --max-w: 1200px;
  }

  .page-shell {
    position: relative;
    min-height: 100vh;
    padding: 2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    color: var(--text);
    background: var(--bg);
    overflow: hidden;
  }

  .page-title {
    font-size: 2.2rem;
    margin-bottom: 1.25rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--accent);
    text-shadow: var(--title-shadow);
    z-index: 2;
    text-align: center;
  }

  .glass-card {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    backdrop-filter: blur(12px);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    padding: 1.25rem;
    color: var(--text);
  }

  .filters-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: .8rem;
    margin-bottom: 1rem;
  }

  .input {
    width: 100%;
    color: var(--text);
    background: #fff;
    border: 1px solid var(--glass-border);
    border-radius: 10px;
    padding: .65rem .8rem;
    outline: none;
    transition: border-color .2s ease, box-shadow .2s ease;
  }
  .input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(111, 70, 70, .2);
  }

  .table-wrap { overflow: auto; border-radius: 12px; }
  .glass-table {
    width: 100%;
    border-collapse: collapse;
    background: #fff; /* solid white table */
  }
  .glass-table th, .glass-table td {
    padding: .85rem .9rem;
    border-bottom: 1px solid rgba(0,0,0,.08);
    color: var(--text);
  }
  .glass-table thead th {
    background: rgba(147, 113, 113, 0.95);
    color: #000;
    font-size: .85rem;
    letter-spacing: .5px;
    position: sticky;
    top: 0;
  }
  /* Align numbers right, text left */
  .glass-table th:nth-child(7),
  .glass-table th:nth-child(8),
  .glass-table th:nth-child(9),
  .glass-table td:nth-child(7),
  .glass-table td:nth-child(8),
  .glass-table td:nth-child(9) {
    text-align: right;
  }
  .glass-table tbody tr:hover { background: var(--glass-hover); }

  .row-actions { display: flex; gap: .5rem; flex-wrap: wrap; }
  /* Buttons - light theme friendly */
  .btn {
    appearance: none;
    border-radius: 10px;
    padding: .9rem .9rem;
    font-weight: 600;
    letter-spacing: .5px;
    margin-left: 4px;
    margid-bottom: 3px;
    cursor: pointer;
    transition: transform .2s ease, box-shadow .2s ease, background .2s ease, border-color .2s ease;
  }

  .btn--primary {
    background: var(--accent);
    color: #fff; /* white text on accent */
    border: none;
    box-shadow: 0 4px 10px rgba(111,70,70,0.25);
  }
  .btn--primary:hover {
    background: rgb(90, 55, 55);
  }

  .btn--ghost {
    background: transparent;
    color: var(--accent);
    border: 1px solid var(--accent);
  }
  .btn--ghost:hover {
    background: rgba(111,70,70,0.05);
  }

  .btn--danger-outline {
    background: transparent;
    color: #d9534f;
    border: 1px solid rgba(217,83,79,0.6);
  }
  .btn--danger-outline:hover {
    background: rgba(217,83,79,0.08);
  }

  .btn--sm {
    padding: .45rem .7rem;
    font-size: .85rem;
  }

  /* Modal */
  .glass-modal-content.modal-content {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    color: var(--text);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
  }
`}</style>

    </div>
  );
};

export default InvoiceListPage;
