import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Container, Table, Form, Button, Row, Col, Modal
} from 'react-bootstrap';
import AddCustomerForm from './AddCustomerForm';

export default function CustomerListPage() {
  const [customers, setCustomers]   = useState([]);
  const [search, setSearch]         = useState('');
  const [filters, setFilters]       = useState({
    balance_gt: '',
    credit_exceeded: false
  });
  const [showModal, setShowModal]   = useState(false);
  const [editCust, setEditCust]     = useState(null);

  const fetchCustomers = useCallback(async () => {
    const params = {};
    if (search)                      params.search = search;
    if (filters.balance_gt !== '')   params.balance_gt = filters.balance_gt;
    if (filters.credit_exceeded)     params.credit_exceeded = true;

    try {
      const res = await axios.get('/api/customers', { params });
      setCustomers(res.data);
    } catch (err) {
      console.error('Failed to fetch customers', err);
    }
  }, [search, filters]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this customer?')) return;
    try {
      await axios.delete(`/api/customers/${id}`);
      fetchCustomers();
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  };

  return (
    <Container className="my-4">
      <h4>👥 Customer List</h4>
      <Row className="mb-3">
        <Col md={4}>
          <Form.Control
            placeholder="Search name, CNIC, mobile"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </Col>
        <Col md="auto">
          <Form.Check
            type="checkbox"
            label="Balance > 0"
            checked={filters.balance_gt !== ''}
            onChange={e => setFilters(f => ({
              ...f,
              balance_gt: e.target.checked ? 0 : ''
            }))}
          />
        </Col>
        <Col md="auto">
          <Form.Check
            type="checkbox"
            label="Credit Limit Exceeded"
            checked={filters.credit_exceeded}
            onChange={e => setFilters(f => ({
              ...f,
              credit_exceeded: e.target.checked
            }))}
          />
        </Col>
        <Col className="text-end">
          <Button onClick={() => { setEditCust(null); setShowModal(true); }}>
            + Add New Customer
          </Button>
        </Col>
      </Row>

      <Table bordered hover responsive>
        <thead>
          <tr>
            <th>Name</th>
            <th>Mobile</th>
            <th>CNIC</th>
            <th>Total Purchases</th>
            <th>Outstanding Balance</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {customers.map(c => {
            const totalPurchases = parseFloat(c.total_purchases) || 0;
            const balance        = parseFloat(c.balance)         || 0;
            return (
              <tr key={c.id}
                  className={balance > (c.credit_limit || 0) ? 'table-danger' : ''}>
                <td>{c.name}</td>
                <td>{c.mobile}</td>
                <td>{c.cnic}</td>
                <td>Rs {totalPurchases.toFixed(2)}</td>
                <td>Rs {balance.toFixed(2)}</td>
                <td>
                  <Button size="sm"
                          onClick={() => { setEditCust(c); setShowModal(true); }}>
                    Edit
                  </Button>{' '}
                  <Button size="sm" variant="danger"
                          onClick={() => handleDelete(c.id)}>
                    Delete
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{editCust ? 'Edit Customer' : 'Add Customer'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <AddCustomerForm
            initialData={editCust}
            onSuccess={() => {
              setShowModal(false);
              fetchCustomers();
            }}
          />
        </Modal.Body>
      </Modal>
    </Container>
  );
}
