import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Container, Table, Form, Button, Row, Col, Accordion
} from 'react-bootstrap';

const BankListPage = () => {
  const [banks, setBanks] = useState([]);
  const [editIndex, setEditIndex] = useState(null);
  const [payments, setPayments] = useState({});
  const [totals, setTotals] = useState({});
  const [newBank, setNewBank] = useState({ name: '', account_number: '', branch: '' });

  const fetchBanks = async () => {
    const res = await axios.get('/api/banks');
    setBanks(res.data);
  };

  useEffect(() => {
    fetchBanks();
  }, []);

  const loadPayments = async (bankId) => {
    if (payments[bankId]) return;
    const res = await axios.get(`/api/banks/${bankId}/payments`);
    setPayments(prev => ({ ...prev, [bankId]: res.data.payments }));
    setTotals(prev => ({ ...prev, [bankId]: res.data.total }));
  };

  const handleAddBank = async (e) => {
    e.preventDefault();
    await axios.post('/api/banks', newBank);
    setNewBank({ name: '', account_number: '', branch: '' });
    fetchBanks();
  };

  const handleBankChange = (idx, field, value) => {
    const updated = [...banks];
    updated[idx][field] = value;
    setBanks(updated);
  };

  const handleBankUpdate = async (bank) => {
    await axios.put(`/api/banks/${bank.id}`, bank);
    setEditIndex(null);
    fetchBanks();
  };

  return (
    <Container className="my-4">
      <h4>🏦 Banks</h4>

      <Form onSubmit={handleAddBank} className="mb-4">
        <Row>
          <Col md={3}><Form.Control placeholder="Bank Name" value={newBank.name} onChange={e => setNewBank({ ...newBank, name: e.target.value })} /></Col>
          <Col md={3}><Form.Control placeholder="Account #" value={newBank.account_number} onChange={e => setNewBank({ ...newBank, account_number: e.target.value })} /></Col>
          <Col md={3}><Form.Control placeholder="Branch" value={newBank.branch} onChange={e => setNewBank({ ...newBank, branch: e.target.value })} /></Col>
          <Col md={3}><Button type="submit">➕ Add Bank</Button></Col>
        </Row>
      </Form>

      <Accordion>
        {banks.map((bank, idx) => (
          <Accordion.Item key={bank.id} eventKey={String(idx)} onClick={() => loadPayments(bank.id)}>
            <Accordion.Header>
              {editIndex === idx ? (
                <>
                  <Form.Control
                    size="sm"
                    value={bank.name}
                    onChange={(e) => handleBankChange(idx, 'name', e.target.value)}
                    style={{ width: '150px', marginRight: '5px' }}
                  />
                  <Form.Control
                    size="sm"
                    value={bank.account_number}
                    onChange={(e) => handleBankChange(idx, 'account_number', e.target.value)}
                    style={{ width: '150px', marginRight: '5px' }}
                  />
                  <Form.Control
                    size="sm"
                    value={bank.branch}
                    onChange={(e) => handleBankChange(idx, 'branch', e.target.value)}
                    style={{ width: '150px' }}
                  />
                  <Button size="sm" variant="success" onClick={() => handleBankUpdate(bank)} className="ms-2">💾</Button>
                </>
              ) : (
                <>
                  {bank.name} - {bank.account_number} ({bank.branch})
                  <Button size="sm" variant="outline-primary" onClick={(e) => {
                    e.stopPropagation();
                    setEditIndex(idx);
                  }} className="ms-3">✏️ Edit</Button>
                </>
              )}
            </Accordion.Header>

            <Accordion.Body>
              <strong>Total Payments:</strong> Rs {totals[bank.id]?.toLocaleString() || 0}
              <hr />
              <Table striped bordered hover size="sm">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(payments[bank.id] || []).map((p, i) => (
                    <tr key={i}>
                      <td>{p.customer_name || 'N/A'}</td>
                      <td>{new Date(p.date).toLocaleDateString()}</td>
                      <td>Rs {p.amount}</td>
                    </tr>
                  ))}
                  {(payments[bank.id] || []).length === 0 && (
                    <tr><td colSpan={3}>No payments yet.</td></tr>
                  )}
                </tbody>
              </Table>
            </Accordion.Body>
          </Accordion.Item>
        ))}
      </Accordion>
    </Container>
  );
};

export default BankListPage;
