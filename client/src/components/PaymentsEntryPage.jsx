import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Container, Form, Row, Col, Button, Tab, Tabs
} from 'react-bootstrap';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';


const PaymentsEntryPage = () => {
  const [tabKey, setTabKey] = useState('received');
  const [customers, setCustomers] = useState([]);
  const [banks, setBanks] = useState([]);
  const [customerDetails, setCustomerDetails] = useState(null);
  const [manualAmount, setManualAmount] = useState(false);

  const initialForm = {
    date: new Date().toISOString().split("T")[0],
    type: tabKey,
    customer_id: '',
    amount: '',
    mode: 'cash',
    bank_id: '',
    remarks: '',
    receipt: null
  };

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
      <div className={`alert ${balance === 0 ? 'alert-success' : 'alert-amroon'} p-3`}>
        <div><strong>Total Purchases:</strong> ₹ {safeNum(customerDetails.total_purchases).toFixed(2)}</div>
        <div><strong>Unpaid Invoices:</strong> ₹ {safeNum(customerDetails.unpaid_total).toFixed(2)}</div>
        <div className="mt-2">
          {
            isPositive
              ? <>Owes Us: <strong className="text-danger">₹ {balance.toFixed(2)}</strong></>
              : isNegative
                ? <>We Owe: <strong className="text-success">₹ {(-balance).toFixed(2)}</strong></>
                : <>Account Settled ✅</>
          }
        </div>
      </div>
    );
  };

  return (
    <Container className="my-4">
      <ToastContainer />
      <h4 className="mb-3 text-dark">🔢 Payment Entry</h4>

      <Tabs activeKey={tabKey} onSelect={handleTabChange} className="mb-3 custom-tabs" justify>
  <Tab
    eventKey="received"
    title={
      <span className={`tab-title ${tabKey === 'received' ? 'active-tab' : ''}`}>
        Receive Payment
      </span>
    }
  />
  <Tab
    eventKey="paid"
    title={
      <span className={`tab-title ${tabKey === 'paid' ? 'active-tab' : ''}`}>
        Make Payment
      </span>
    }
  />
</Tabs>


      <div className="bg-form-card">
        <Form onSubmit={handleSubmit} encType="multipart/form-data">
          <Row className="mb-3">
            <Col md={3}>
              <Form.Label>Date</Form.Label>
              <Form.Control type="date" name="date" value={form.date} onChange={handleChange} />
            </Col>

            <Col md={3}>
              <Form.Label>{tabKey === 'received' ? 'Customer' : 'Supplier'}</Form.Label>
              <Form.Select name="customer_id" value={form.customer_id} onChange={handleChange}>
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
                type="number"
                name="amount"
                value={form.amount}
                onChange={handleChange}
                min="0.01"
                step="0.01"
                disabled={!manualAmount}
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
              <Form.Select name="mode" value={form.mode} onChange={handleChange}>
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
              </Form.Select>
            </Col>

            {form.mode === 'bank' && (
              <Col md={3}>
                <Form.Label>Bank Account</Form.Label>
                <Form.Select name="bank_id" value={form.bank_id} onChange={handleChange}>
                  <option value="">Select Bank</option>
                  {banks.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </Form.Select>
              </Col>
            )}

            <Col md={3}>
              <Form.Label>Remarks / Reference</Form.Label>
              <Form.Control name="remarks" value={form.remarks} onChange={handleChange} />
            </Col>
          </Row>

          {renderBalance()}

          <Row className="mb-3">
            <Col md={4}>
              <Form.Label>Attach Receipt</Form.Label>
              <Form.Control type="file" name="receipt" accept="application/pdf,image/*" onChange={handleChange} />
            </Col>
          </Row>

          <Button
            type="submit"
            className="btn-amroon"
            disabled={!form.amount || safeNum(form.amount) <= 0 || !customerDetails}
          >
            💾 Save Payment
          </Button>
        </Form>
      </div>
    </Container>
  );
};

export default PaymentsEntryPage;
