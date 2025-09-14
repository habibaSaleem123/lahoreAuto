// src/components/GdEntryForm.js
import React, { useState, useEffect, useRef } from 'react';
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
  const fileInputRef = useRef(null);
  const formRef = useRef(null);

  // Keyboard navigation scoped to this form (Enter logic improved)
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    let inputs = Array.from(form.querySelectorAll('input, select, textarea'))
      .filter(el => !el.disabled && el.offsetParent !== null && el.type !== 'button');

    const handleKeyDown = (e) => {
      const index = inputs.indexOf(e.target);
      if (index === -1) return;

      // ENTER behavior
      if (e.key === 'Enter') {
        const isTextArea = e.target.tagName === 'TEXTAREA';
        const isButton = e.target.tagName === 'BUTTON';
        const isLast = index === inputs.length - 1;

        // If target is submit button, let it submit normally
        if (isButton && e.target.type === 'submit') {
          return; // Allow default submit behavior
        }

        // Ctrl/Cmd + Enter → submit anywhere
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          handleSubmit(e);
          return;
        }

        // Shift+Enter or Enter inside textarea → allow newline (no preventDefault)
        if (e.shiftKey || isTextArea) return;

        // Not last field → move focus to next and DO NOT submit
        if (!isLast) {
          e.preventDefault();
          inputs[index + 1].focus();
          return;
        }

        // Last field → allow native submit (no preventDefault)
        return;
      }

      // UP → previous
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (index > 0) inputs[index - 1].focus();
      }

      // DOWN → next
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (index < inputs.length - 1) inputs[index + 1].focus();
      }
    };

    inputs.forEach(input => input.addEventListener('keydown', handleKeyDown));
    if (inputs.length) inputs[0].focus();

    return () => {
      inputs.forEach(input => input.removeEventListener('keydown', handleKeyDown));
    };
  }, [items, charges]);

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
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json(sheet);

      const mappedItems = parsed.map((row, idx) => ({
        item_number: row['ITEM #'] ?? idx + 1,
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
        regulatory_duty: Number(row['RD']) || 0,
        // leave the rest blank; user can fill in later
        per_unit_sales_tax: '', retail_price: '', mrp: '', cost: '', gross_margin: '', sale_price: ''
      }));

      setItems(mappedItems);
      Swal.fire('Imported', `Loaded ${mappedItems.length} row(s) from Excel.`, 'success');
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate required header fields
    const newErrors = {};
    const requiredFields = ['gd_number', 'gd_date', 'supplier_name', 'invoice_value'];

    Object.entries(header).forEach(([key, value]) => {
      if (requiredFields.includes(key) && !value.trim()) {
        newErrors[key] = `${key.replace(/_/g, ' ')} is required`;
      }
    });

    // Validate at least one item
    const validItems = items.filter(item =>
      item.description.trim() || item.hs_code.trim() || item.quantity
    );

    if (validItems.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Validation Error',
        text: 'Please add at least one item with description, HS code, or quantity.',
        confirmButtonColor: '#ff4c4c'
      });
      return;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      const missingFields = Object.keys(newErrors).map(key =>
        key.replace(/_/g, ' ')
      ).join(', ');

      Swal.fire({
        icon: 'warning',
        title: 'Missing Required Fields',
        html: `Please fill the following required fields:<br><strong>${missingFields}</strong>`,
        confirmButtonColor: '#ff4c4c'
      });

      // Focus on first error field
      const firstErrorField = document.querySelector(`[name="${Object.keys(newErrors)[0]}"]`);
      if (firstErrorField) {
        firstErrorField.focus();
        firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setErrors({});

    const validCharges = charges.filter(
      c => c.charge_type.trim() && c.charge_amount !== '' && !isNaN(c.charge_amount)
    );

    try {
      // Use relative path to work with dev proxy or prod server without CORS issues
      const res = await axios.post('/api/gd', {
        header,
        items: validItems,
        charges: validCharges
      });
      setLandedCost(res.data.landed_cost ?? null);

      Swal.fire({
        icon: 'success',
        title: 'Success!',
        text: 'GD Entry submitted successfully.',
        confirmButtonColor: '#28a745'
      });
    } catch (err) {
      console.error(err);
      const errorMsg = err.response?.data?.error || err.message || 'Something went wrong.';

      Swal.fire({
        icon: 'error',
        title: 'Submission Error',
        text: errorMsg,
        confirmButtonColor: '#ff4c4c'
      });
    }
  };

  // Direct submit handler for button click
  const handleButtonSubmit = (e) => {
    e.preventDefault();
    handleSubmit(e);
  };

  return (
    <Container fluid className="gd-container">
      <div className="gd-overlay" aria-hidden />
      <header className="gd-header">
        <h2>📋 GD Entry Form</h2>

        <div className="gd-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="d-none"
            onChange={handleFileUpload}
          />
          <Button
            className="btn-neon"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <FaFileUpload className="me-2" /> Import Excel
          </Button>
          <Button
            className="btn-outline-neon ms-2"
            type="button"
            onClick={() => {
              setHeader(initialHeader);
              setItems([blankItem]);
              setCharges([{ charge_type: '', charge_amount: '' }]);
              setLandedCost(null);
            }}
            title="Clear all fields"
          >
            Reset
          </Button>
        </div>
      </header>

      <Form onSubmit={handleSubmit} ref={formRef}>
        {/* Header */}
        <Card className="neon-card mb-5">
          <Card.Header className="neon-card__header">GD Header Details</Card.Header>
          <Card.Body>
            <Row>
              {[0, 1].map((colIndex) => {
                const keys = Object.entries(header);
                const half = Math.ceil(keys.length / 2);
                const slice = colIndex === 0 ? keys.slice(0, half) : keys.slice(half);

                return (
                  <Col md={6} key={colIndex}>
                    <Table bordered responsive hover className="dark-table mb-3">
                      <tbody>
                        {slice.map(([key, value]) => {
                          const isRequired = ['gd_number', 'gd_date', 'supplier_name', 'invoice_value'].includes(key);
                          return (
                            <tr key={key}>
                              <th className="text-capitalize">
                                {key.replace(/_/g, ' ')}
                                {isRequired && <span className="text-danger ms-1">*</span>}
                              </th>
                              <td>
                                <Form.Control
                                  className="input-dark"
                                  type={key === 'gd_date' ? 'date' : 'text'}
                                  name={key}
                                  value={value}
                                  onChange={handleHeaderChange}
                                  isInvalid={!!errors[key]}
                                  placeholder={`${key.replace(/_/g, ' ')}${isRequired ? ' (required)' : ''}`}
                                  title={`Enter ${key.replace(/_/g, ' ')}`}
                                  required={isRequired}
                                />
                                <Form.Control.Feedback type="invalid">
                                  {errors[key]}
                                </Form.Control.Feedback>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </Col>
                );
              })}
            </Row>
          </Card.Body>
        </Card>

        {/* Items */}
        <Card className="neon-card mb-5">
          <Card.Header className="neon-card__header">📦 Item Details</Card.Header>
          <Card.Body style={{ overflowX: 'auto' }}>
            <Table bordered hover responsive size="sm" className="dark-table striped">
              <thead>
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
                          className="input-dark"
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

            <Button onClick={addItem} className="btn-neon mt-3" type="button">
              <FaPlus className="me-2" /> Add Item
            </Button>
          </Card.Body>
        </Card>

        {/* Charges */}
        <Card className="neon-card mb-5">
          <Card.Header className="neon-card__header">💰 Additional Charges</Card.Header>
          <Card.Body>
            <Table bordered hover className="dark-table mb-3">
              <thead>
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
                        className="input-dark"
                        name="charge_type"
                        value={charge.charge_type}
                        onChange={(e) => handleChargeChange(i, e)}
                        placeholder="Type"
                        title="Enter charge type"
                      />
                    </td>
                    <td>
                      <Form.Control
                        className="input-dark"
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

            <Button onClick={addCharge} className="btn-outline-neon mt-2" type="button">
              <FaPlus className="me-2" /> Add Charge
            </Button>
          </Card.Body>
        </Card>

        {/* Submit */}
        <div className="d-grid">
          <Button
            type="submit"
            className="btn-submit-neon"
            size="lg"
            onClick={handleButtonSubmit}
          >
            <FaCheckCircle className="me-2" /> Submit GD
          </Button>
        </div>
      </Form>

      {landedCost !== null && (
        <Alert variant="dark" className="mt-4 neon-alert">
          <strong>📊 Average Landed Cost:</strong> Rs {Number(landedCost).toFixed(2)} <br />
          <span className="text-muted">Suggested sale price can be refined in the items table.</span>
        </Alert>
      )}

      {/* Theme styles */}
      <style>{`
        :root {
          --bg:rgb(35, 29, 29);
          --accent: #ff4c4c;
          --glass: rgba(255,255,255,0.05);
          --border: rgba(255, 76, 76, 0.35);
          --active: rgba(255, 76, 76, 0.20);
          --text:rgb(29, 19, 19);
          --muted:rgb(0, 0, 0);
        }

        .gd-container {
          position: relative;
          min-height: 100vh;
          padding: 2rem;
          color: var(--text);
          background: var(--bg);
          overflow: hidden;
        }

        /* moving grid like ModulesPage */
        @media (prefers-reduced-motion: no-preference) {
          .gd-container::before {
            content: "";
            position: absolute;
            inset: -100%;
            background:
              repeating-linear-gradient(120deg, rgba(255,76,76,.05) 0 2px, transparent 2px 20px);
            animation: moveBg 15s linear infinite;
            z-index: 0;
          }
          @keyframes moveBg { to { transform: translate(-20%, -20%); } }
        }

        .gd-overlay {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at top left, rgba(255,76,76,.08), transparent 70%);
          z-index: 1;
          pointer-events: none;
        }

        .gd-header {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.5rem;
        }
        .gd-header h2 {
          margin: 0;
          font-weight: 800;
          letter-spacing: 1px;
          color: var(--accent);
          text-shadow: 0 2px 10px rgba(255,76,76,.45);
          text-transform: uppercase;
        }
        .gd-actions { display: flex; align-items: center; }

        .neon-card {
          position: relative;
          z-index: 2;
          background: var(--glass) !important;
          border: 1px solid var(--border) !important;
          border-radius: 18px !important;
          box-shadow: 0 8px 20px rgba(255, 76, 76, .12);
          color: var(--text);
          overflow: hidden;
          backdrop-filter: blur(10px);
        }
        .neon-card__header {
          background: linear-gradient(90deg, rgba(255,76,76,.18), rgba(255,76,76,0));
          color: var(--text);
          font-weight: 700;
          border-bottom: 1px solid var(--border);
        }

        .dark-table {
          color: var(--text);
          border-color: rgba(255,255,255,0.08) !important;
        }
        .dark-table thead th {
          background: rgba(69, 21, 21, 0.71);
          color: #fff;
          border-color: rgba(255,255,255,0.08) !important;
          white-space: nowrap;
        }
          
        .dark-table tbody tr:hover td {
          background: rgba(255,255,255,0.03);
        }
        .dark-table.striped tbody tr:nth-of-type(odd) {
          background: rgba(255,255,255,0.02);
        }

        .input-dark {
          background: rgba(0,0,0,0.4) !important;
          color: var(--text) !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
        }
        .input-dark:focus {
          border-color: var(--accent) !important;
          box-shadow: 0 0 0 .25rem rgba(255, 76, 76, .25) !important;
        }

        .btn-neon {
          background: var(--accent) !important;
          border: 1px solid rgba(174, 73, 73, 0.6) !important;
          color: #fff !important;
          font-weight: 700;
        }
        .btn-neon:hover {
          background:rgb(153, 42, 42) !important;
          box-shadow: 0 12px 22px rgba(255, 76, 76, .35);
        }

        .btn-outline-neon {
          background: transparent !important;
          border: 1px solid var(--accent) !important;
          color: var(--accent) !important;
          font-weight: 700;
        }
        .btn-outline-neon:hover {
          background: rgba(255,76,76,.15) !important;
          color: #fff !important;
          box-shadow: 0 12px 22px rgba(255, 76, 76, .25);
        }

        .btn-submit-neon {
          background: linear-gradient(90deg, var(--accent), #ff7a7a) !important;
          border: 1px solid rgba(105, 19, 19, 0.6) !important;
          color: #fff !important;
          font-weight: 800;
          letter-spacing: .5px;
          text-transform: uppercase;
        }
        .btn-submit-neon:hover {
          filter: brightness(1.05);
          box-shadow: 0 16px 26px rgba(255, 76, 76, .35);
        }

        .neon-alert {
          position: relative;
          z-index: 2;
          background: rgba(255,255,255,0.06);
          border: 1px solid var(--border);
          color: var(--text);
        }

        /* ✅ Improved contrast vs. forcing black on dark backgrounds */
        .input-dark::placeholder {
          color: var(--muted) !important;
          opacity: 1;
        }
        .dark-table tbody td,
        .dark-table tbody th {
          color: var(--text) !important;
        }

        /* Bootstrap overrides for dark background */
        .table > :not(caption) > * > * {
          background-color: transparent;
        }
        th, td { vertical-align: middle; }
      `}</style>
    </Container>
  );
}
