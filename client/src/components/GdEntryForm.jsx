import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import axios from 'axios';
import {
  Container, Row, Col, Form, Table, Button, Card, Alert
} from 'react-bootstrap';
import { FaPlus, FaFileUpload, FaCheckCircle } from 'react-icons/fa';
import Swal from 'sweetalert2';

const initialHeader = {
  gd_number: '', gd_date: '', supplier_name: '', invoice_value: '', freight: '',
  insurance: '', clearing_charges: '', port_charges: '', gross_weight: '',
  net_weight: '', number_of_packages: '', container_no: '', vessel_name: '',
  port_of_loading: '', port_of_discharge: '', delivery_terms: '', bl_awb_no: '',
  exchange_rate: '', invoice_currency: '', assessed_value: '', payment_mode: '',
  psid_no: '', bank_name: '', total_gd_amount: '', challan_no: ''
};

const blankItem = {
  item_number: '', description: '', hs_code: '', quantity: '', unit_price: '',
  total_value: '', total_custom_value: '', invoice_value: '', unit_cost: '',
  unit: '', gross_weight: '', custom_duty: '', sales_tax: '', ast: '',
  income_tax: '', acd: '', regulatory_duty: '', gst: '',
  per_unit_sales_tax: '', retail_price: '', mrp: '',
  cost: '', gross_margin: '', sale_price: ''
};

export default function GdEntryForm() {
  const [header, setHeader] = useState(initialHeader);
  const [items, setItems] = useState([blankItem]);
  const [charges, setCharges] = useState([{ charge_type: '', charge_amount: '' }]);
  const [landedCost, setLandedCost] = useState(null);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const inputs = Array.from(document.querySelectorAll('input, select, textarea')).filter(
      (el) => !el.disabled && el.offsetParent !== null
    );
    if (inputs.length) inputs[0].focus();

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const index = inputs.indexOf(e.target);
        if (index > -1 && index < inputs.length - 1) {
          inputs[index + 1].focus();
        }
      }
    };

    inputs.forEach((input) => input.addEventListener('keydown', handleKeyDown));

    return () => {
      inputs.forEach((input) => input.removeEventListener('keydown', handleKeyDown));
    };
  }, []);

  const handleHeaderChange = (e) => {
    const { name, value } = e.target;
    setHeader((prev) => ({ ...prev, [name]: value }));

    // Real-time validation
    if (!value.trim()) {
      setErrors((prev) => ({ ...prev, [name]: `${name.replace(/_/g, ' ')} is required` }));
    } else {
      setErrors((prev) => {
        const updated = { ...prev };
        delete updated[name];
        return updated;
      });
    }
  };

  const handleItemChange = (i, e) => {
    const updated = [...items];
    updated[i][e.target.name] = e.target.value;
    setItems(updated);
  };

  const handleChargeChange = (i, e) => {
    const updated = [...charges];
    updated[i][e.target.name] = e.target.value;
    setCharges(updated);
  };

  const addItem = () => setItems([...items, { ...blankItem }]);
  const addCharge = () => setCharges([...charges, { charge_type: '', charge_amount: '' }]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json(sheet);

      const mappedItems = parsed.map((row, idx) => ({
        item_number: idx + 1,
        description: row['ITEM'] || '',
        hs_code: row['HS Code'] || '',
        quantity: Number(row['Quantity']) || 0,
        unit_price: Number(row['Unit Price']) || 0,
        total_value: Number(row['Total Value']) || 0,
        total_custom_value: Number(row['Import Value (Rs)']) || 0,
        invoice_value: Number(row['Import Export Value Invoice']) || 0,
        unit_cost: Number(row['PER PCS IMPORT VALUE']) || 0,
        unit: row['unit'] || '',
        gross_weight: Number(row['WEIGHT']) || 0,
        custom_duty: Number(row['CD']) || 0,
        sales_tax: Number(row['ST']) || 0,
        gst: Number(row['GST']) || 0,
        ast: Number(row['AST']) || 0,
        income_tax: Number(row['IT']) || 0,
        acd: Number(row['ACD']) || 0,
        regulatory_duty: Number(row['RD']) || 0
      }));

      setItems(mappedItems);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const newErrors = {};
    Object.entries(header).forEach(([key, value]) => {
      if (!value.trim()) {
        newErrors[key] = `${key.replace(/_/g, ' ')} is required`;
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      Swal.fire('Validation Error', 'Please fill all required GD Header fields.', 'warning');
      return;
    }

    setErrors({});

    const validCharges = charges.filter(
      c => c.charge_type.trim() && c.charge_amount !== '' && !isNaN(c.charge_amount)
    );

    try {
      const res = await axios.post('http://localhost:5000/api/gd-entry', {
        header,
        items,
        charges: validCharges
      });
      setLandedCost(res.data.landed_cost);
      Swal.fire('Success!', 'GD Entry submitted successfully.', 'success');
    } catch (err) {
      console.error(err);
      Swal.fire('Error!', 'Something went wrong.', 'error');
    }
  };

  // Inside GdEntryForm component, replace the JSX return block with this:

return (
  <Container
    fluid
    className="py-5 px-4"
    style={{
      background: 'linear-gradient(to bottom right, rgb(236, 226, 226), rgb(19, 4, 4))',
      color: '#000',
      minHeight: '100vh',
    }}
  >
    <h2 className="mb-4 fw-bold">📋 GD Entry Form</h2>
    <Form onSubmit={handleSubmit}>
      {/* Header */}
      <Card
        className="mb-5"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(0,0,0,0.1)',
          borderRadius: '20px',
          backdropFilter: 'blur(10px)',
        }}
      >
        <Card.Header className="fw-bold">📄 GD Header Details</Card.Header>
        <Card.Body>
          <Row>
            {[0, 1].map((colIndex) => {
              const keys = Object.entries(header);
              const half = Math.ceil(keys.length / 2);
              const slice = colIndex === 0 ? keys.slice(0, half) : keys.slice(half);

              return (
                <Col md={6} key={colIndex}>
                  <Table bordered responsive hover className="mb-3">
                    <tbody>
                      {slice.map(([key, value]) => (
                        <tr key={key}>
                          <th className="text-capitalize">{key.replace(/_/g, ' ')}</th>
                          <td>
                            <Form.Control
                              type={key === 'gd_date' ? 'date' : 'text'}
                              name={key}
                              value={value}
                              onChange={handleHeaderChange}
                              isInvalid={!!errors[key]}
                              placeholder={key.replace(/_/g, ' ')}
                              title={`Enter ${key.replace(/_/g, ' ')}`}
                            />
                            <Form.Control.Feedback type="invalid">
                              {errors[key]}
                            </Form.Control.Feedback>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Col>
              );
            })}
          </Row>
        </Card.Body>
      </Card>

      {/* Items Table */}
      <Card
        className="mb-5"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(0,0,0,0.1)',
          borderRadius: '20px',
          backdropFilter: 'blur(10px)',
        }}
      >
        <Card.Header className="fw-bold">📦 Item Details</Card.Header>
        <Card.Body style={{ overflowX: 'auto' }}>
          <Table bordered striped hover responsive size="sm">
            <thead className="table-dark">
              <tr>
                {Object.keys(blankItem).map((key, idx) => (
                  <th key={idx}>{key.replace(/_/g, ' ')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  {Object.entries(item).map(([k, v]) => (
                    <td key={k}>
                      <Form.Control
                        name={k}
                        value={v}
                        onChange={(e) => handleItemChange(i, e)}
                        placeholder={k.replace(/_/g, ' ')}
                        title={`Enter ${k.replace(/_/g, ' ')}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
          <Button
  onClick={addItem}
  className="mt-3"
  style={{
    backgroundColor: '#000',
    color: '#fff',
    border: '1px solid #000',
  }}
>
  <FaPlus className="me-2" /> Add Item
</Button>

        </Card.Body>
      </Card>

      {/* Charges Table */}
      <Card
        className="mb-5"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(0,0,0,0.1)',
          borderRadius: '20px',
          backdropFilter: 'blur(10px)',
        }}
      >
        <Card.Header className="fw-bold">💰 Additional Charges</Card.Header>
        <Card.Body>
          <Table bordered hover className="mb-3">
            <thead className="table-dark">
              <tr>
                <th>Charge Type</th>
                <th>Charge Amount</th>
              </tr>
            </thead>
            <tbody>
              {charges.map((charge, i) => (
                <tr key={i}>
                  <td>
                    <Form.Control
                      name="charge_type"
                      value={charge.charge_type}
                      onChange={(e) => handleChargeChange(i, e)}
                      placeholder="Type"
                      title="Enter charge type"
                    />
                  </td>
                  <td>
                    <Form.Control
                      type="number"
                      name="charge_amount"
                      value={charge.charge_amount}
                      onChange={(e) => handleChargeChange(i, e)}
                      placeholder="Amount"
                      title="Enter charge amount"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Button
  style={{
    backgroundColor: '#000',
    color: '#fff',
    border: '1px solid #000',
  }}
  onClick={addCharge}
  className="mt-2"
>
  <FaPlus className="me-2" /> Add Charge
</Button>

        </Card.Body>
      </Card>

      {/* Submit Button */}
      <div className="d-grid">
        <Button type="submit" variant="success" size="lg">
          <FaCheckCircle className="me-2" /> Submit GD
        </Button>
      </div>
    </Form>

    {landedCost !== null && (
      <Alert variant="info" className="mt-4">
        <strong>📊 Average Landed Cost:</strong> Rs {landedCost.toFixed(2)} <br />
        <span className="text-muted">You can view suggested sale price in the items table above.</span>
      </Alert>
    )}
  </Container>
);

}
