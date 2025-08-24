import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { Container, Form, Row, Col, Button } from 'react-bootstrap';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const PaymentsEntryPage = () => {
  const [tabKey, setTabKey] = useState('received');
  const [customers, setCustomers] = useState([]);
  const [banks, setBanks] = useState([]);
  const [customerDetails, setCustomerDetails] = useState(null);
  const [manualAmount, setManualAmount] = useState(false);

  // ----- Refs for keyboard nav -----
  const formRef = useRef(null);

  const tabReceiveRef = useRef(null);
  const tabPaidRef = useRef(null);

  const dateRef = useRef(null);
  const customerRef = useRef(null);
  const amountRef = useRef(null);
  const modeRef = useRef(null);
  const bankRef = useRef(null);
  const remarksRef = useRef(null);
  const receiptRef = useRef(null);
  const saveRef = useRef(null);

  // For detecting "double Enter"
  const lastEnterTs = useRef(0);

  const initialForm = useMemo(() => ({
    date: new Date().toISOString().split("T")[0],
    type: tabKey,
    customer_id: '',
    amount: '',
    mode: 'cash',
    bank_id: '',
    remarks: '',
    receipt: null
  }), [tabKey]);

  const [form, setForm] = useState(initialForm);

  const safeNum = val => isNaN(parseFloat(val)) ? 0 : parseFloat(`${val}`.replace(/,/g, ''));

  useEffect(() => {
    axios.get('/api/customers').then(res => setCustomers(res.data));
    axios.get('/api/banks').then(res => setBanks(res.data.filter(b => b.is_active)));
  }, []);

  useEffect(() => {
    if (form.customer_id) {
      axios.get(`/api/customers/${form.customer_id}`)
        .then(res => {
          const details = res.data;
          setCustomerDetails(details);

          if (!manualAmount) {
            const bal = safeNum(details.balance);
            const autoAmount = tabKey === 'received' ? Math.max(bal, 0) : Math.max(-bal, 0);
            setForm(prev => ({ ...prev, amount: autoAmount }));
          }
        })
        .catch(() => {
          toast.error("❌ Failed to load customer details");
          setCustomerDetails(null);
        });
    } else {
      setCustomerDetails(null);
    }
  }, [form.customer_id, tabKey, manualAmount]);

  const resetForm = (type = tabKey) => {
    setForm({
      ...initialForm,
      date: new Date().toISOString().split("T")[0],
      type
    });
    setCustomerDetails(null);
    setManualAmount(false);
    // focus first field after reset
    setTimeout(() => dateRef.current?.focus(), 0);
  };

  const handleChange = ({ target }) => {
    const { name, value, files } = target;
    setForm(prev => ({ ...prev, [name]: files ? files[0] : value }));
  };

  const handleTabChange = k => {
    setTabKey(k);
    resetForm(k);
  };

  const validateAmount = () => {
    const bal = safeNum(customerDetails?.balance);
    const amt = safeNum(form.amount);
    if (tabKey === 'received' && amt > Math.max(bal, 0)) {
      toast.error('❌ Amount exceeds customer\'s outstanding balance');
      return false;
    }
    if (tabKey === 'paid' && amt > Math.max(-bal, 0)) {
      toast.error('❌ Amount exceeds amount we owe customer');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateAmount()) return;

    const data = new FormData();
    Object.entries(form).forEach(([k, v]) => data.append(k, v));
    data.append('payment_for', 'customer');

    try {
      await axios.post('/api/payments', data);
      toast.success('✅ Payment recorded');
      resetForm();
    } catch (err) {
      toast.error(`❌ ${err.response?.data?.error || 'Failed to record payment'}`);
    }
  };

  const renderBalance = () => {
    if (!customerDetails) return null;
    const balance = safeNum(customerDetails.balance);
    const isPositive = balance > 0;
    const isNegative = balance < 0;

    return (
      <div className={`alert ${balance === 0 ? 'alert-success' : 'alert-amroon'} p-3`} role="status" aria-live="polite">
        <div><strong>Total Purchases:</strong> ₹ {safeNum(customerDetails.total_purchases).toFixed(2)}</div>
        <div><strong>Unpaid Invoices:</strong> ₹ {safeNum(customerDetails.unpaid_total).toFixed(2)}</div>
        <div className="mt-2">
          {isPositive
            ? <>Owes Us: <strong className="text-danger">₹ {balance.toFixed(2)}</strong></>
            : isNegative
              ? <>We Owe: <strong className="text-success">₹ {(-balance).toFixed(2)}</strong></>
              : <>Account Settled ✅</>}
        </div>
      </div>
    );
  };

  // ----- Keyboard navigation helpers -----

  const openSelect = (selectEl) => {
    if (!selectEl) return;
    if (typeof selectEl.showPicker === 'function') {
      selectEl.showPicker();
    } else {
      // fallback
      selectEl.click();
    }
  };

  // Ordered focus list (includes tabs first), auto-updated when bank field appears
  const focusables = useMemo(() => {
    const arr = [
      tabReceiveRef.current,
      tabPaidRef.current,
      dateRef.current,
      customerRef.current,
      amountRef.current,
      modeRef.current,
      ...(form.mode === 'bank' ? [bankRef.current] : []),
      remarksRef.current,
      receiptRef.current,
      saveRef.current
    ].filter(Boolean);
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.mode]);

  const focusMove = (currentEl, dir = 1) => {
    const idx = focusables.indexOf(currentEl);
    if (idx === -1 || focusables.length === 0) return;

    // wrap-around navigation
    let nextIndex = idx + dir;
    if (nextIndex < 0) nextIndex = focusables.length - 1;
    if (nextIndex >= focusables.length) nextIndex = 0;

    const next = focusables[nextIndex];
    if (next?.focus) next.focus();
  };

  const jumpFirst = () => focusables[0]?.focus?.();
  const jumpLast = () => focusables[focusables.length - 1]?.focus?.();

  const handleFieldKeyDown = (e, opts = {}) => {
    const { isSelect = false } = opts;

    // Left/Right to move across fields (wraps)
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusMove(e.currentTarget, +1);
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusMove(e.currentTarget, -1);
      return;
    }

    // Up goes back to the active tab chip
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      (tabKey === 'received' ? tabReceiveRef : tabPaidRef).current?.focus();
      return;
    }

    // Home/End quick jumps
    if (e.key === 'Home') { e.preventDefault(); jumpFirst(); return; }
    if (e.key === 'End')  { e.preventDefault(); jumpLast();  return; }

    // Dropdown open logic for selects
    if (isSelect && (e.key === ' ' || e.key === 'Enter')) {
      const now = performance.now();
      const delta = now - lastEnterTs.current;
      if (e.key === 'Enter') {
        // double-enter within 350ms
        if (delta < 350) {
          e.preventDefault();
          openSelect(e.currentTarget);
        }
        lastEnterTs.current = now;
      } else {
        // Space opens directly
        e.preventDefault();
        openSelect(e.currentTarget);
      }
    }
    // Up/Down inside <select> work natively for option navigation
  };

  // Tabs keyboard support: Left/Right swaps focus between chips, Enter activates, Down enters form
  const handleTabKeyDown = (e, which) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const nextKey = which === 'received' ? 'paid' : 'received';
      (nextKey === 'received' ? tabReceiveRef : tabPaidRef).current?.focus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      dateRef.current?.focus();
      return;
    }
    if (e.key === 'Home') { e.preventDefault(); tabReceiveRef.current?.focus(); return; }
    if (e.key === 'End')  { e.preventDefault(); tabPaidRef.current?.focus();    return; }

    if (e.key === 'Enter') {
      e.preventDefault();
      handleTabChange(which);           // updates highlight
      setTimeout(() => dateRef.current?.focus(), 0); // focus into form
    }
  };

  return (
    <div className="payments-body">
      <div className="payments-overlay" />
      <Container className="my-4 p-4 bg-white text-dark rounded-4 shadow-sm payments-container">
        <ToastContainer />
        <h4 className="mb-3 fw-bold heading-amroon">🔢 Payment Entry</h4>

        {/* Tabs with explicit keyboard focus + highlight */}
        <div className="amroon-tabs mb-3" role="tablist" aria-label="Payment Type">
          <button
            ref={tabReceiveRef}
            role="tab"
            aria-selected={tabKey === 'received'}
            aria-controls="tab-panel-received"
            id="tab-received"
            className={`tab-chip ${tabKey === 'received' ? 'active' : ''}`}
            onClick={() => handleTabChange('received')}
            onKeyDown={(e) => handleTabKeyDown(e, 'received')}
            tabIndex={0}
            type="button"
          >
            Receive Payment
          </button>
          <button
            ref={tabPaidRef}
            role="tab"
            aria-selected={tabKey === 'paid'}
            aria-controls="tab-panel-paid"
            id="tab-paid"
            className={`tab-chip ${tabKey === 'paid' ? 'active' : ''}`}
            onClick={() => handleTabChange('paid')}
            onKeyDown={(e) => handleTabKeyDown(e, 'paid')}
            tabIndex={0}
            type="button"
          >
            Make Payment
          </button>
        </div>

        <div className="bg-form-card" role="region" aria-labelledby={tabKey === 'received' ? 'tab-received' : 'tab-paid'}>
          <Form ref={formRef} onSubmit={handleSubmit} encType="multipart/form-data">
            <Row className="mb-3">
              <Col md={3}>
                <Form.Label>Date</Form.Label>
                <Form.Control
                  ref={dateRef}
                  type="date"
                  name="date"
                  value={form.date}
                  onChange={handleChange}
                  onKeyDown={handleFieldKeyDown}
                />
              </Col>

              <Col md={3}>
                <Form.Label>{tabKey === 'received' ? 'Customer' : 'Supplier'}</Form.Label>
                <Form.Select
                  ref={customerRef}
                  name="customer_id"
                  value={form.customer_id}
                  onChange={handleChange}
                  onKeyDown={(e) => handleFieldKeyDown(e, { isSelect: true })}
                >
                  <option value="">Select</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.business_name})</option>
                  ))}
                </Form.Select>
              </Col>
            </Row>

            <Row className="mb-3">
              <Col md={3}>
                <Form.Label>Amount</Form.Label>
                <Form.Control
                  ref={amountRef}
                  type="number"
                  name="amount"
                  value={form.amount}
                  onChange={handleChange}
                  min="0.01"
                  step="0.01"
                  disabled ={!manualAmount}
                  onKeyDown={handleFieldKeyDown}
                />
                {customerDetails && (
                  <Form.Text muted>
                    {tabKey === 'received' ? 'Auto-filled: customer owes us' : 'Auto-filled: we owe customer'}
                  </Form.Text>
                )}
                <Form.Check
                  className="mt-2"
                  type="switch"
                  label="Manual override"
                  checked={manualAmount}
                  onChange={e => setManualAmount(e.target.checked)}
                />
              </Col>

              <Col md={3}>
                <Form.Label>Mode</Form.Label>
                <Form.Select
                  ref={modeRef}
                  name="mode"
                  value={form.mode}
                  onChange={handleChange}
                  onKeyDown={(e) => handleFieldKeyDown(e, { isSelect: true })}
                >
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                </Form.Select>
              </Col>

              {form.mode === 'bank' && (
                <Col md={3}>
                  <Form.Label>Bank Account</Form.Label>
                  <Form.Select
                    ref={bankRef}
                    name="bank_id"
                    value={form.bank_id}
                    onChange={handleChange}
                    onKeyDown={(e) => handleFieldKeyDown(e, { isSelect: true })}
                  >
                    <option value="">Select Bank</option>
                    {banks.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </Form.Select>
                </Col>
              )}

              <Col md={3}>
                <Form.Label>Remarks / Reference</Form.Label>
                <Form.Control
                  ref={remarksRef}
                  name="remarks"
                  value={form.remarks}
                  onChange={handleChange}
                  onKeyDown={handleFieldKeyDown}
                />
              </Col>
            </Row>

            {renderBalance()}

            <Row className="mb-3">
              <Col md={4}>
                <Form.Label>Attach Receipt</Form.Label>
                <Form.Control
                  ref={receiptRef}
                  type="file"
                  name="receipt"
                  accept="application/pdf,image/*"
                  onChange={handleChange}
                  onKeyDown={handleFieldKeyDown}
                />
              </Col>
            </Row>

            <Button
              ref={saveRef}
              type="submit"
              className="btn-amroon"
              disabled={!form.amount || safeNum(form.amount) <= 0 || !customerDetails}
              onKeyDown={(e) => {
                // Arrow nav
                if (e.key === 'ArrowLeft') { e.preventDefault(); focusMove(e.currentTarget, -1); return; }
                if (e.key === 'ArrowRight') { e.preventDefault(); focusMove(e.currentTarget, +1); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); (tabKey === 'received' ? tabReceiveRef : tabPaidRef).current?.focus(); return; }
                if (e.key === 'Home') { e.preventDefault(); jumpFirst(); return; }
                if (e.key === 'End')  { e.preventDefault(); jumpLast();  return; }
                // Ensure Enter/Space always submit the form
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault(); // avoid double-submit
                  formRef.current?.requestSubmit();
                }
              }}
              onClick={() => {
                // mouse/touch click still submits (redundant but explicit)
                formRef.current?.requestSubmit();
              }}
            >
              💾 Save Payment
            </Button>
          </Form>
        </div>
      </Container>

      {/* Styles: body black + animated lines + red overlay + highlighted tabs */}
      <style>{`
        .payments-body {
          position: relative;
          min-height: 100vh;
          padding: 2rem 0;
          background: #0d0d0d;
          overflow: hidden;
        }
        .payments-body::before {
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
          animation: payMoveBg 15s linear infinite;
          z-index: 0;
        }
        @keyframes payMoveBg {
          0% { transform: translate(0, 0); }
          100% { transform: translate(-20%, -20%); }
        }
        .payments-overlay {
          position: absolute; inset: 0; z-index: 1;
          background: radial-gradient(circle at top left, rgba(255, 76, 76, 0.08), transparent 70%);
          pointer-events: none;
        }
        .payments-container { position: relative; z-index: 2; }

        .bg-form-card {
          background: #ffffff;
          border: 1px solid rgba(255, 76, 76, 0.25);
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 6px 18px rgba(0,0,0,0.06), 0 2px 4px rgba(255,76,76,0.06) inset;
        }
        .heading-amroon { color: #1a1a1a; letter-spacing: .3px; }

        /* Tab chips with selected highlight */
        .amroon-tabs {
          display: inline-flex; gap: .5rem;
        }
        .tab-chip {
          appearance: none;
          border: 1px solid rgba(255, 76, 76, 0.35);
          background: rgba(255, 255, 255, 0.9);
          color: #222;
          padding: .5rem .9rem;
          border-radius: 999px;
          font-weight: 700;
          cursor: pointer;
          outline: none;
          transition: box-shadow .2s ease, background .2s ease, transform .06s ease;
        }
        .tab-chip:hover { transform: translateY(-1px); }
        .tab-chip.active {
          color: #ff4c4c;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(255, 76, 76, 0.18) inset, 0 6px 14px rgba(255, 76, 76, 0.22);
          border-color: #ff4c4c;
        }
        .tab-chip:focus-visible {
          box-shadow: 0 0 0 3px rgba(255, 76, 76, 0.35);
        }

        .btn-amroon {
          background: #ff4c4c;
          border: 1px solid #ff4c4c;
          font-weight: 700;
          padding: 0.6rem 1.1rem;
          border-radius: 12px;
          transition: transform .08s ease, box-shadow .2s ease;
        }
        .btn-amroon:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 18px rgba(255, 76, 76, 0.35);
          background: #ff4c4c;
          border-color: #ff4c4c;
        }
        .btn-amroon:disabled { opacity: 0.6; box-shadow: none; }

        .alert-amroon {
          background: rgba(255, 76, 76, 0.06);
          border: 1px solid rgba(255, 76, 76, 0.35);
          color: #5c1f1f;
          border-radius: 12px;
        }

        /* Inputs */
        .form-label, .form-check-label { color: #222; font-weight: 600; }
        .form-control, .form-select {
          border-radius: 10px;
          border-color: rgba(0,0,0,0.1);
        }
        .form-control:focus, .form-select:focus {
          border-color: #ff4c4c;
          box-shadow: 0 0 0 .25rem rgba(255, 76, 76, 0.15);
        }
      `}</style>
    </div>
  );
};

export default PaymentsEntryPage;
