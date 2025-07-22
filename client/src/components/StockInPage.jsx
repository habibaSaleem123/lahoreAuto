import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Container, Table, Button, Modal, Form } from 'react-bootstrap';
import { toast } from 'react-toastify';

const StockInPage = () => {
  const [gds, setGds] = useState([]);
  const [selectedGd, setSelectedGd] = useState(null);
  const [items, setItems] = useState([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [stockedBy, setStockedBy] = useState('');
  const [stockedAt, setStockedAt] = useState(new Date().toISOString().slice(0, 16));

  const fetchUnstocked = async () => {
    try {
      const res = await axios.get('http://localhost:5000/api/stock/unstocked-gds');
      setGds(res.data);
    } catch (err) {
      console.error('Error fetching unstocked GDs:', err);
    }
  };

  const fetchGdItems = async (gdId) => {
    try {
      const res = await axios.get(`http://localhost:5000/api/gd-details/${gdId}`);
      setSelectedGd(res.data.gd);
      setItems(res.data.items);
      setShowConfirm(true);
    } catch (err) {
      console.error('Error fetching GD items:', err);
    }
  };

  const processStockIn = async () => {
    if (!stockedBy.trim()) {
      toast.error("Please enter who is stocking this GD.");
      return;
    }

    try {
      await axios.post(`http://localhost:5000/api/stock/stock-in/${selectedGd.id}`, {
        stocked_by: stockedBy,
        stocked_at: new Date(stockedAt).toISOString()
      });

      toast.success('✅ Stocked in successfully!');
      setShowConfirm(false);
      fetchUnstocked();
    } catch (err) {
      toast.error('❌ Failed to stock in.');
      console.error('Stock-in error:', err);
    }
  };

  useEffect(() => {
    fetchUnstocked();
  }, []);

  return (
    <Container className="my-4">
      <h3 className="mb-4 text-center">📦 Unstocked GDs</h3>

      <Table bordered hover responsive className="stock-table">
        <thead>
          <tr>
            <th>GD Number</th>
            <th>Date</th>
            <th>Supplier</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {gds.length === 0 ? (
            <tr>
              <td colSpan="4" className="text-center py-4">No unstocked GDs found.</td>
            </tr>
          ) : (
            gds.map(gd => (
              <tr key={gd.id}>
                <td>{gd.gd_number}</td>
                <td>{new Date(gd.gd_date).toLocaleDateString()}</td>
                <td>{gd.supplier_name}</td>
                <td>
                  <Button variant="outline-primary" size="sm" onClick={() => fetchGdItems(gd.id)}>
                    ➕ Process Stock In
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      {/* Confirmation Modal */}
      <Modal show={showConfirm} onHide={() => setShowConfirm(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            Confirm Stock In — GD #{selectedGd?.gd_number}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form className="mb-3">
            <Form.Group className="mb-2">
              <Form.Label><strong>Stocked By</strong></Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter your name"
                value={stockedBy}
                onChange={(e) => setStockedBy(e.target.value)}
              />
            </Form.Group>
            <Form.Group>
              <Form.Label><strong>Date & Time</strong></Form.Label>
              <Form.Control
                type="datetime-local"
                value={stockedAt}
                onChange={(e) => setStockedAt(e.target.value)}
              />
            </Form.Group>
          </Form>

          <Table bordered responsive>
            <thead className="table-secondary">
              <tr>
                <th>Item ID</th>
                <th>Description</th>
                <th>HS Code</th>
                <th>Quantity</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.item_id}>
                  <td>{item.item_id}</td>
                  <td>{item.description}</td>
                  <td>{item.hs_code}</td>
                  <td>{item.quantity}</td>
                  <td>{item.unit}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowConfirm(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={processStockIn}>
            ✅ Confirm Stock In
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default StockInPage;
