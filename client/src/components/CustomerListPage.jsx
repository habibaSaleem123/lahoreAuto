import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import AddCustomerForm from './AddCustomerForm';
import { Modal } from 'react-bootstrap';

export default function CustomerListPage() {
  const [customers, setCustomers]   = useState([]);
  const [search, setSearch]         = useState('');
  const [filters, setFilters]       = useState({
    balance_gt: '',
    credit_exceeded: false
  });
  const [showModal, setShowModal]   = useState(false);
  const [editCust, setEditCust]     = useState(null);

  const fetchCustomers = useCallback(async () => {
    const params = {};
    if (search)                      params.search = search;
    if (filters.balance_gt !== '')   params.balance_gt = filters.balance_gt;
    if (filters.credit_exceeded)     params.credit_exceeded = true;

    try {
      const res = await axios.get('/api/customers', { params });
      setCustomers(res.data);
    } catch (err) {
      console.error('Failed to fetch customers', err);
    }
  }, [search, filters]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this customer?')) return;
    try {
      await axios.delete(`/api/customers/${id}`);
      fetchCustomers();
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  };

  return (
    <div className="page-shell">
      <div className="page-overlay" />
      <h2 className="page-title">Customers</h2>

      <div className="page-content">
        <section className="glass-card">
          <header className="panel-header">
            <h3>👥 Customer List</h3>
            <div className="panel-actions">
              <button
                className="btn btn--primary"
                onClick={() => { setEditCust(null); setShowModal(true); }}
              >
                + Add New Customer
              </button>
            </div>
          </header>

          {/* Filters */}
          <div className="filters-grid">
            <input
              className="input"
              placeholder="Search name, CNIC, mobile"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            <label className="check">
              <input
                type="checkbox"
                checked={filters.balance_gt !== ''}
                onChange={e => setFilters(f => ({
                  ...f,
                  balance_gt: e.target.checked ? 0 : ''
                }))}
              />
              <span>Balance &gt; 0</span>
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={filters.credit_exceeded}
                onChange={e => setFilters(f => ({
                  ...f,
                  credit_exceeded: e.target.checked
                }))}
              />
              <span>Credit Limit Exceeded</span>
            </label>

            <div className="filters-actions">
              <button className="btn btn--ghost" onClick={fetchCustomers}>🔍 Apply</button>
            </div>
          </div>

          {/* Table */}
          <div className="table-wrap">
            <table className="table glass-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>CNIC</th>
                  <th>Total Purchases</th>
                  <th>Owes Us</th>
                  <th>We Owe</th>
                  <th>Net Position</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {customers.map(c => {
                  const totalPurchases = parseFloat(c.total_purchases) || 0;
                  const balance = parseFloat(c.balance) || 0;
                  const overLimit = balance > (c.credit_limit || 0);

                  return (
                    <tr key={c.id} className={overLimit ? 'row--overlimit' : ''}>
                      <td>{c.name}</td>
                      <td>{c.mobile}</td>
                      <td>{c.cnic}</td>
                      <td>Rs {totalPurchases.toFixed(2)}</td>
                      <td>{balance > 0 ? `Rs ${balance.toFixed(2)}` : '-'}</td>
                      <td>{balance < 0 ? `Rs ${Math.abs(balance).toFixed(2)}` : '-'}</td>
                      <td>
                        <strong>Rs {Math.abs(balance).toFixed(2)}</strong><br />
                        <small>
                          {balance > 0
                            ? 'Customer owes us'
                            : balance < 0
                              ? 'We owe customer'
                              : 'Settled'}
                        </small>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="btn btn--ghost btn--sm"
                            onClick={() => { setEditCust(c); setShowModal(true); }}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn--danger-outline btn--sm"
                            onClick={() => handleDelete(c.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!customers.length && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', opacity: .8, padding: '2rem' }}>
                      No customers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Themed Modal (keeps your existing form & success flow) */}
      <Modal
        show={showModal}
        onHide={() => setShowModal(false)}
        size="lg"
        centered
        dialogClassName="glass-modal"
        contentClassName="glass-modal-content"
        backdropClassName="glass-modal-backdrop"
      >
        <Modal.Header closeButton>
          <Modal.Title>{editCust ? 'Edit Customer' : 'Add Customer'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <AddCustomerForm
            initialData={editCust}
            onSuccess={() => {
              setShowModal(false);
              fetchCustomers();
            }}
          />
        </Modal.Body>
      </Modal>

      <style>{`
  :root{
    --bg:#0d0d0d; 
    --text:#fff; 
    --accent:#ff4c4c;
    --glass-bg:rgba(255,255,255,0.9); /* lighter, whitish */
    --glass-border:rgba(88, 16, 16, 0.3);
    --glass-hover:rgba(255,76,76,.15);
    --radius-lg:15px;
    --shadow-sm:0 8px 20px rgba(255,76,76,.1);
    --shadow-lg:0 12px 25px rgba(255,76,76,.4);
    --title-shadow:0 2px 10px rgba(255,76,76,.5);
    --max-w:1200px;
  }

  .page-shell{
    position:relative; min-height:100vh; padding:2rem;
    display:flex; flex-direction:column; align-items:center;
    color:var(--text); background:var(--bg); overflow:hidden;
  }
  .page-shell::before{
    content:""; position:absolute; top:0; left:0; width:300%; height:300%;
    background-image:repeating-linear-gradient(120deg, rgba(255,76,76,.05) 0px, rgba(255,76,76,.05) 2px, transparent 2px, transparent 20px);
    animation:moveBackground 15s linear infinite; z-index:0;
  }
  @keyframes moveBackground{ 0%{transform:translate(0,0)} 100%{transform:translate(-20%,-20%)} }
  .page-overlay{ position:absolute; inset:0; background:radial-gradient(circle at top left, rgba(255,76,76,.08), transparent 70%); z-index:1; }
  .page-title{
    z-index:2; text-align:center; font-size:2.2rem; margin-bottom:1.25rem;
    font-weight:800; text-transform:uppercase; letter-spacing:2px;
    color:var(--accent); text-shadow:var(--title-shadow);
  }
  .page-content{ width:100%; max-width:var(--max-w); z-index:2; }

  .glass-card{
    background:var(--glass-bg);
    border:1px solid var(--glass-border);
    backdrop-filter:blur(12px);
    border-radius:var(--radius-lg);
    box-shadow:var(--shadow-sm);
    padding:1.25rem;
    color:#222; /* darker text for contrast */
  }
  .panel-header{ display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-bottom:1rem; }
  .panel-header h3{ margin:0; letter-spacing:.5px; color:#222; }

  .filters-grid{
    display:grid;
    grid-template-columns: 1fr repeat(2, max-content) max-content;
    gap:.8rem; align-items:center; margin-bottom:1rem;
  }
  .filters-actions{ justify-self:end; }
  .check{ display:flex; align-items:center; gap:.5rem; font-size:.95rem; opacity:.95; color:#222; }

  .input{
    width:100%; color:#222; background:rgba(0,0,0,.03);
    border:1px solid var(--glass-border); border-radius:10px;
    padding:.65rem .8rem; outline:none;
    transition:border-color .2s ease, box-shadow .2s ease, background .2s ease;
  }
  .input:focus{ border-color:var(--accent); box-shadow:0 0 0 3px rgba(255,76,76,.2); background:rgba(0,0,0,.05); }

  .btn{
    appearance:none; border:1px solid transparent; border-radius:10px;
    padding:.6rem .9rem; font-weight:800; letter-spacing:.5px; cursor:pointer;
    transition:transform .2s ease, box-shadow .2s ease, background .2s ease, border-color .2s ease, opacity .2s ease;
  }
  .btn--primary{ background:var(--accent); color:#0a0a0a; box-shadow:0 6px 16px rgba(255,76,76,.25); }
  .btn--ghost{ background:transparent; color:var(--accent); border-color:var(--glass-border); }
  .btn--danger-outline{ background:transparent; color:#c00; border:1px solid rgba(117, 45, 45, 0.5); }
  .btn--sm{ padding:.45rem .7rem; font-size:.85rem; }
  .btn:hover{ transform:translateY(-1px); }

  .table-wrap{ overflow:auto; border-radius:12px; }
  .glass-table{ width:100%; border-collapse:collapse; background:rgba(255,255,255,.9); }
  .glass-table th, .glass-table td{
    padding:.85rem .9rem; border-bottom:1px solid rgba(0,0,0,.08);
    color:#222;
  }
  .glass-table thead th{
    background:rgba(255,255,255,.95);
    color:#000;
    font-size:.85rem; letter-spacing:.5px;
    position:sticky; top:0;
  }
  /* Align numbers right, text left */
  .glass-table th:nth-child(4),
  .glass-table th:nth-child(5),
  .glass-table th:nth-child(6),
  .glass-table th:nth-child(7),
  .glass-table td:nth-child(4),
  .glass-table td:nth-child(5),
  .glass-table td:nth-child(6),
  .glass-table td:nth-child(7) {
    text-align: right;
  }
  .glass-table tbody tr:hover{ background:var(--glass-hover); }

  .row--overlimit{ background:rgba(255,76,76,.08); }
  .row-actions{ display:flex; gap:.5rem; flex-wrap:wrap; }

  /* Modal theming */
  .glass-modal .modal-dialog{ max-width:900px; }
  .glass-modal-content.modal-content{
    background:var(--glass-bg);
    border:1px solid var(--glass-border);
    color:#222;
    backdrop-filter:blur(12px);
    border-radius:var(--radius-lg);
    box-shadow:var(--shadow-lg);
  }
  .glass-modal-backdrop.modal-backdrop.show{ opacity:.5; }

  :focus-visible{ outline:2px solid var(--accent); outline-offset:2px; }
  @media (max-width: 820px){
    .filters-grid{
      grid-template-columns: 1fr;
      grid-auto-rows: minmax(0, auto);
    }
    .filters-actions{ justify-self:start; }
  }
  @media (max-width:576px){
    .page-title{ font-size:1.7rem; }
    .panel-header{ flex-direction:column; align-items:stretch; }
  }
`}</style>

    </div>
  );
}
