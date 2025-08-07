import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Container, Table, Form, Button } from 'react-bootstrap';

const StockReportPage = () => {
  const [data, setData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  useEffect(() => {
    axios.get('/api/reports/stock')
      .then(res => setData(res.data))
      .catch(err => console.error('Error loading stock report:', err));
  }, []);

  const filtered = data.filter(item => {
    const search = searchTerm.toLowerCase();
    const match =
      item.description?.toLowerCase().includes(search) ||
      item.unit?.toLowerCase().includes(search);

    const stockCheck = lowStockOnly ? item.available < 20 : true;

    return match && stockCheck;
  });

  return (
    <Container className="my-4">
      <h3 className="mb-3 text-center">📦 Stock Report</h3>

      <div className="d-flex flex-wrap gap-3 mb-3 justify-content-between">
        <Form.Control
          type="text"
          placeholder="🔍 Search by description or unit"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ maxWidth: 300 }}
        />

        <Form.Check
          type="checkbox"
          label="Low Stock Only"
          checked={lowStockOnly}
          onChange={(e) => setLowStockOnly(e.target.checked)}
        />
      </div>

      <Table bordered hover responsive>
        <thead className="table-light">
          <tr>
            <th>Item Description</th>
            <th>Unit</th>
            <th>Opening Stock</th>
            <th>Sold</th>
            <th>Returned</th>
            <th>Available</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center py-4">No matching records.</td>
            </tr>
          ) : (
            filtered.map((item, idx) => (
              <tr key={idx} className={item.available < 20 ? 'table-danger' : ''}>
                <td>{item.description}</td>
                <td>{item.unit}</td>
                <td>{item.gd_in}</td>
                <td>{item.sold}</td>
                <td>{item.returned}</td>
                <td><strong>{item.available}</strong></td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <Button variant="outline-success" className="mt-3" onClick={() => window.print()}>
        🖨️ Print Report
      </Button>
    </Container>
  );
};

export default StockReportPage;
