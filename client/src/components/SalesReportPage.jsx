import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Container, Table, Form, Row, Col, Button } from 'react-bootstrap';

const SalesReportPage = () => {
  const [sales, setSales] = useState([]);
  const [filters, setFilters] = useState({
    customer: '',
    hs_code: '',
    item_name: '',
    start_date: '',
    end_date: '',
    status: 'all'
  });

  useEffect(() => {
    fetchSales();
  }, []);

  const fetchSales = async () => {
    try {
      const res = await axios.get('/api/reports/sales', { params: filters });
      setSales(res.data);
    } catch (err) {
      console.error('Failed to load sales report:', err);
    }
  };

  const handleChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const applyFilters = () => {
    fetchSales();
  };

  const totalQty = sales.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const totalAmount = sales.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
  const totalTax = sales.reduce((sum, row) => sum + Number(row.tax_amount || 0), 0);

  return (
    <Container className="my-4">
      <h3 className="mb-3 text-center">🧾 Sales Report</h3>

      {/* Filters */}
      <Row className="g-3 mb-3">
        <Col md={3}>
          <Form.Control
            type="text"
            placeholder="Customer"
            name="customer"
            value={filters.customer}
            onChange={handleChange}
          />
        </Col>
        <Col md={3}>
          <Form.Control
            type="text"
            placeholder="Item Name"
            name="item_name"
            value={filters.item_name}
            onChange={handleChange}
          />
        </Col>
        <Col md={2}>
          <Form.Control
            type="text"
            placeholder="HS Code"
            name="hs_code"
            value={filters.hs_code}
            onChange={handleChange}
          />
        </Col>
        <Col md={2}>
          <Form.Select name="status" value={filters.status} onChange={handleChange}>
            <option value="all">All</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </Form.Select>
        </Col>
        <Col md={2}>
          <Button variant="primary" onClick={applyFilters}>
            🔍 Apply Filters
          </Button>
        </Col>
        <Col md={3}>
          <Form.Control
            type="date"
            name="start_date"
            value={filters.start_date}
            onChange={handleChange}
          />
        </Col>
        <Col md={3}>
          <Form.Control
            type="date"
            name="end_date"
            value={filters.end_date}
            onChange={handleChange}
          />
        </Col>
      </Row>

      {/* Table */}
      <Table bordered hover responsive>
        <thead className="table-light">
          <tr>
            <th>Invoice</th>
            <th>Date</th>
            <th>Customer</th>
            <th>Item</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Tax</th>
            <th>Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {sales.length === 0 ? (
            <tr>
              <td colSpan="9" className="text-center py-4">No records found.</td>
            </tr>
          ) : (
            sales.map((row, idx) => (
              <tr key={idx}>
                <td>{row.invoice_number}</td>
                <td>{new Date(row.invoice_date).toLocaleDateString()}</td>
                <td>{row.customer_name}</td>
                <td>{row.item_description}</td>
                <td>{row.quantity}</td>
                <td>Rs {Number(row.unit_price).toFixed(2)}</td>
                <td>Rs {Number(row.tax_amount).toFixed(2)}</td>
                <td>Rs {Number(row.total_amount).toFixed(2)}</td>
                <td>{row.status}</td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      {/* Summary */}
      <div className="mt-4">
        <h6><strong>Total Quantity:</strong> {totalQty}</h6>
        <h6><strong>Total Revenue:</strong> Rs {totalAmount.toFixed(2)}</h6>
        <h6><strong>Total Tax:</strong> Rs {totalTax.toFixed(2)}</h6>
      </div>

      <Button variant="outline-success" className="mt-3" onClick={() => window.print()}>
        🖨️ Print Sales Report
      </Button>
    </Container>
  );
};

export default SalesReportPage;
