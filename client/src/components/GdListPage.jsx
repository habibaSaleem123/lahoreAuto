import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  Container, Table, Form, Button, Row, Col, Card
} from 'react-bootstrap';

const GdListPage = () => {
  const [filters, setFilters] = useState({
    gd_number: '', gd_date: '', supplier_name: '', hs_code: ''
  });
  const [gds, setGds] = useState([]);

  const fetchData = async () => {
    try {
      const params = new URLSearchParams(filters);
      const res = await axios.get(`http://localhost:5000/api/gd-list?${params.toString()}`);
      setGds(res.data);
    } catch (error) {
      console.error('Error fetching GD list:', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const handleSearch = () => {
    fetchData();
  };

  return (
    <Container className="my-5">
      <h2 className="text-center">📂 GD List / History</h2>

      <Card className="mb-4">
        <Card.Body>
          <Row className="g-3">
            <Col md={3}>
              <Form.Label>GD Number</Form.Label>
              <Form.Control
                name="gd_number"
                placeholder="e.g. GD-12345"
                value={filters.gd_number}
                onChange={handleFilterChange}
              />
            </Col>
            <Col md={2}>
              <Form.Label>GD Date</Form.Label>
              <Form.Control
                type="date"
                name="gd_date"
                value={filters.gd_date}
                onChange={handleFilterChange}
              />
            </Col>
            <Col md={3}>
              <Form.Label>Supplier</Form.Label>
              <Form.Control
                name="supplier_name"
                placeholder="Supplier Name"
                value={filters.supplier_name}
                onChange={handleFilterChange}
              />
            </Col>
            <Col md={2}>
              <Form.Label>HS Code</Form.Label>
              <Form.Control
                name="hs_code"
                placeholder="e.g. 8708.29"
                value={filters.hs_code}
                onChange={handleFilterChange}
              />
            </Col>
            <Col md={2} className="d-grid">
              <Button variant="outline-primary" onClick={handleSearch}>
                🔍 Search
              </Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card>
        <Card.Body className="p-0">
          <Table striped bordered hover responsive className="gd-table mb-0">
            <thead>
              <tr>
                <th>GD Number</th>
                <th>Date</th>
                <th>Supplier</th>
                <th>Total Items</th>
                <th>Avg Landed Cost</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {gds.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-4">No GD entries found.</td>
                </tr>
              ) : (
                gds.map(gd => (
                  <tr key={gd.id}>
                    <td>{gd.gd_number}</td>
                    <td>{new Date(gd.gd_date).toLocaleDateString()}</td>
                    <td>{gd.supplier_name}</td>
                    <td>{gd.item_count}</td>
                    <td>
                      {isNaN(Number(gd.landed_cost)) ? '0.00' : Number(gd.landed_cost).toFixed(2)}
                    </td>
                    <td>
                      <Link to={`/gd/${gd.id}`} className="btn btn-sm btn-outline-primary">
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default GdListPage;
