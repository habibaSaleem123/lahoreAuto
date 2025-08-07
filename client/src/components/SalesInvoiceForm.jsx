import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Container, Form, Button, Table, Row, Col, Modal,
  Toast, ToastContainer
} from 'react-bootstrap';
import AddCustomerForm from './AddCustomerForm';
import { useNavigate } from 'react-router-dom';

const SalesInvoiceForm = () => {
  const [customers, setCustomers] = useState([]);
  const [gds, setGds] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedCustomerData, setSelectedCustomerData] = useState(null);
  const [selectedGD, setSelectedGD] = useState(null);
  const [gdItems, setGdItems] = useState([]);
  const [formItems, setFormItems] = useState([]);
  const [search, setSearch] = useState('');
  const [withholdingRate, setWithholdingRate] = useState(0.01);
  const [taxSection, setTaxSection] = useState('236H');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    axios.get('/api/customers').then(res => setCustomers(res.data));
    axios.get('/api/gds').then(res => setGds(res.data));
  }, []);

  useEffect(() => {
    if (selectedGD) {
      axios.get(`/api/gds/${selectedGD}/items`).then(res => {
        setGdItems(res.data);
      });
    }
  }, [selectedGD]);

  const handleAddItem = (item) => {
    if (formItems.find(i => i.item_id === item.item_id)) return;
    setFormItems([...formItems, {
      ...item,
      quantity: 0,
      sale_rate: item.sale_price || item.retail_price || 0,
    }]);
  };

  const handleChange = (index, field, value) => {
    const updated = [...formItems];
    updated[index][field] = value;
    setFormItems(updated);
  };

  const calculateLineTotal = (item) =>
    item.quantity * (parseFloat(item.sale_rate || 0) || 0);

  const grossTotal = formItems.reduce((sum, item) => sum + calculateLineTotal(item), 0);
  const salesTax = formItems.reduce(
    (sum, item) => sum + item.quantity * item.retail_price * 0.18,
    0
  );
  const withholdingTax = grossTotal * withholdingRate;

  const handleSubmit = async () => {
    const payload = {
      customer_id: selectedCustomer,
      gd_entry_id: selectedGD,
      items: formItems.filter(i => i.quantity > 0),
      withholding_rate: withholdingRate,
      tax_section: taxSection,
    };

    try {
      const res = await axios.post('/api/sales/create-invoice', payload);
      navigate(`/invoice/${res.data.invoice_number}`);
    } catch (err) {
      alert('❌ Error creating invoice: ' + err.response?.data?.error || err.message);
    }
  };

  return (
    <Container className="my-4">
      <h3>Create Sales Invoice</h3>

      <Row className="mb-3">
        <Col md={4}>
          <Form.Label>Customer</Form.Label>
          <Form.Select
            value={selectedCustomer || ''}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedCustomer(id);

              const customer = customers.find(c => c.id === parseInt(id));
              if (!customer) {
                console.warn("❗ Customer not found for ID:", id);
                setSelectedCustomerData(null);
                setWithholdingRate(0.01);
                return;
              }

              setSelectedCustomerData(customer);
              setWithholdingRate(customer.filer_status === "filer" ? 0.005 : 0.01);
            }}
          >
            <option value="">Select customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.business_name})
              </option>
            ))}
          </Form.Select>
        </Col>

        <Col md={4}>
          <Form.Label>GD (Goods Declaration)</Form.Label>
          <Form.Select onChange={(e) => setSelectedGD(e.target.value)} value={selectedGD || ''}>
            <option value="">Select GD</option>
            {gds.map((g) => (
              <option key={g.id} value={g.id}>
                {g.gd_number}
              </option>
            ))}
          </Form.Select>
        </Col>

        <Col md={2}>
          <Form.Label>Tax Section</Form.Label>
          <Form.Select onChange={(e) => setTaxSection(e.target.value)} value={taxSection}>
            <option value="236G">236G (Distributor)</option>
            <option value="236H">236H (Retailer)</option>
          </Form.Select>
        </Col>

        <Col md={2}>
          <Form.Label>Withholding %</Form.Label>
          <Form.Control
            type="number"
            step="0.001"
            value={withholdingRate}
            onChange={(e) => setWithholdingRate(parseFloat(e.target.value))}
          />
          <Form.Text muted>
            {selectedCustomerData
              ? selectedCustomerData.filer_status === 'filer'
                ? 'Filer (default 0.5%)'
                : 'Non-Filer (default 1%)'
              : 'Select a customer to determine filer status'}
          </Form.Text>
        </Col>
      </Row>

      <Row className="mb-3">
        <Col md={12} className="text-end">
          <Button variant="outline-primary" size="sm" onClick={() => setShowCustomerModal(true)}>
            ➕ Add New Customer
          </Button>
        </Col>
      </Row>

      {selectedGD && (
        <div className="mb-3">
          <Form.Label>🔍 Search Items in GD</Form.Label>
          <Form.Control
            placeholder="Search by description or HS code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="border p-2 bg-light" style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {gdItems
              .filter(i => {
                const desc = i.description || '';
                const hs = i.hs_code || '';
                return (
                  i.quantity_remaining > 0 &&
                  (desc.toLowerCase().includes(search.toLowerCase()) ||
                   hs.includes(search))
                );
              })
              .map((item) => (
                <div key={item.item_id} className="mb-1 cursor-pointer" onClick={() => handleAddItem(item)}>
                  ➕ {item.description} ({item.hs_code})
                </div>
              ))}
          </div>
        </div>
      )}

      {formItems.length > 0 && (
        <>
          <Table bordered hover responsive>
            <thead>
              <tr>
                <th>Description</th>
                <th>HS Code</th>
                <th>Unit</th>
                <th>Retail Price</th>
                <th>Quantity</th>
                <th>Sale Rate</th>
                <th>Line Total</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {formItems.map((item, idx) => (
                <tr key={item.item_id}>
                  <td>{item.description}</td>
                  <td>{item.hs_code}</td>
                  <td>{item.unit}</td>
                  <td>Rs {item.retail_price}</td>
                  <td>
                    <Form.Control
                      type="number"
                      min={0}
                      max={item.quantity_remaining}
                      value={item.quantity}
                      onChange={(e) =>
                        handleChange(idx, 'quantity', parseInt(e.target.value || 0))
                      }
                    />
                  </td>
                  <td>
                    <Form.Control
                      type="number"
                      step="0.01"
                      max={item.retail_price}
                      value={item.sale_rate}
                      onChange={(e) => handleChange(idx, 'sale_rate', e.target.value)}
                    />
                  </td>
                  <td>Rs {calculateLineTotal(item).toFixed(2)}</td>
                  <td>
                    <Button variant="danger" size="sm" onClick={() =>
                      setFormItems(formItems.filter((_, i) => i !== idx))}>❌</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>

          <Row className="mt-3">
            <Col><strong>Gross Total:</strong> Rs {grossTotal.toFixed(2)}</Col>
            <Col><strong>Sales Tax (18%):</strong> Rs {salesTax.toFixed(2)}</Col>
            <Col><strong>Withholding Tax:</strong> Rs {withholdingTax.toFixed(2)}</Col>
          </Row>

          <div className="mt-4">
            <Button onClick={handleSubmit} disabled={!selectedCustomer || !selectedGD}>
              🧾 Create Invoice
            </Button>
          </div>
        </>
      )}

      {/* ➕ Add Customer Modal */}
      <Modal show={showCustomerModal} onHide={() => setShowCustomerModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Add New Customer</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <AddCustomerForm
            onSuccess={(newCustomer) => {
              setShowCustomerModal(false);
              setSelectedCustomer(newCustomer.id);
              setSelectedCustomerData(newCustomer);
              setWithholdingRate(newCustomer.filer_status === "filer" ? 0.005 : 0.01);
              setCustomers(prev => [...prev, newCustomer]); // Optional UI speed
              axios.get('/api/customers').then(res => setCustomers(res.data));
              setToastMessage(`✅ Customer "${newCustomer.name}" added successfully`);
              setShowToast(true);
            }}
          />
        </Modal.Body>
      </Modal>

      {/* ✅ Toast Success */}
      <ToastContainer position="bottom-end" className="p-3">
        <Toast onClose={() => setShowToast(false)} show={showToast} delay={3000} autohide bg="success">
          <Toast.Body className="text-white">{toastMessage}</Toast.Body>
        </Toast>
      </ToastContainer>
    </Container>
  );
};

export default SalesInvoiceForm;
