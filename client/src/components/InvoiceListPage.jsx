import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Table, Button, Form, Row, Col, Container, Modal } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

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

    await axios.post(`/api/sales/invoice/${selectedToPay}/mark-paid`, formData);
    setShowPayModal(false);
    fetchInvoices();
  };

  return (
    <Container className="my-4">
      <h4>📄 Invoice Log</h4>

      <Row className="mb-3">
        <Col md={3}><Form.Control placeholder="Search customer or invoice" value={search} onChange={e => setSearch(e.target.value)} /></Col>
        <Col md={2}>
          <Form.Select value={filter.tax_section} onChange={e => setFilter(f => ({ ...f, tax_section: e.target.value }))}>
            <option value="">All Sections</option>
            <option value="236G">236G</option>
            <option value="236H">236H</option>
          </Form.Select>
        </Col>
        <Col md={2}>
          <Form.Select value={filter.filer_status} onChange={e => setFilter(f => ({ ...f, filer_status: e.target.value }))}>
            <option value="all">All Filers</option>
            <option value="filer">Filer</option>
            <option value="non-filer">Non-Filer</option>
          </Form.Select>
        </Col>
        <Col md={2}>
          <Form.Select value={filter.payment_status} onChange={e => setFilter(f => ({ ...f, payment_status: e.target.value }))}>
            <option value="">All</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </Form.Select>
        </Col>
        <Col md={1}><Form.Control type="date" value={filter.from_date} onChange={e => setFilter(f => ({ ...f, from_date: e.target.value }))} /></Col>
        <Col md={1}><Form.Control type="date" value={filter.to_date} onChange={e => setFilter(f => ({ ...f, to_date: e.target.value }))} /></Col>
        <Col md={1}><Button onClick={fetchInvoices}>🔍</Button></Col>
      </Row>

      <Button className="mb-2 me-2" variant="secondary" onClick={selectAll}>Select All</Button>

      <Table bordered hover responsive>
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
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map(inv => (
            <tr key={inv.invoice_number}>
              <td>
                <Form.Check
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
              <td>{inv.is_paid ? <span className="text-success">Paid</span> : <span className="text-danger">Unpaid</span>}</td>
              <td>
                <Button size="sm" variant="outline-primary" onClick={() => navigate(`/invoice/${inv.invoice_number}`)}>View</Button>{' '}
                {!inv.is_paid && (
                  <Button size="sm" variant="success" onClick={() => openPayModal(inv)}>Mark Paid</Button>
                )}{' '}
                <Button size="sm" variant="outline-danger" onClick={() => handleDelete(inv.invoice_number)} disabled={inv.is_paid}>🗑️</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Button disabled={!selectedInvoices.length} onClick={exportToFBR}>
        📤 Export Selected to FBR
      </Button>

      {/* Modal for marking invoice as paid */}
      <Modal show={showPayModal} onHide={() => setShowPayModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Mark Invoice as Paid</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-2">
            <Form.Label>Bank Name</Form.Label>
            <Form.Control
              value={paymentForm.bank_name}
              onChange={e => setPaymentForm(f => ({ ...f, bank_name: e.target.value }))}
            />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>Payer Name</Form.Label>
            <Form.Control
              value={paymentForm.payer_name}
              onChange={e => setPaymentForm(f => ({ ...f, payer_name: e.target.value }))}
            />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>Payment Date</Form.Label>
            <Form.Control
              type="date"
              value={paymentForm.payment_date}
              onChange={e => setPaymentForm(f => ({ ...f, payment_date: e.target.value }))}
            />
          </Form.Group>
          <Form.Group>
            <Form.Label>Receipt (PDF/Image)</Form.Label>
            <Form.Control
              type="file"
              accept="application/pdf,image/*"
              onChange={e => setPaymentForm(f => ({ ...f, receipt: e.target.files[0] }))}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowPayModal(false)}>Cancel</Button>
          <Button variant="success" onClick={handleMarkPaid}>Mark Paid</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default InvoiceListPage;
