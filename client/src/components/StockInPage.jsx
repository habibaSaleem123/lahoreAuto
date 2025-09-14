// src/components/StockInPage.js
import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Container, Table, Button, Modal, Form, Card, Row, Col, Spinner, Alert } from 'react-bootstrap';
import { toast } from 'react-toastify';

const StockInPage = () => {
  const [gds, setGds] = useState([]);
  const [selectedGd, setSelectedGd] = useState(null);
  const [items, setItems] = useState([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [stockedBy, setStockedBy] = useState('');
  const [stockedAt, setStockedAt] = useState(new Date().toISOString().slice(0, 16));
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState({ show: false, type: 'success', message: '' });

  const fetchUnstocked = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/stock/unstocked-gds');
      setGds(res.data);
    } catch (err) {
      console.error('Error fetching unstocked GDs:', err);
      toast.error('Failed to fetch unstocked GDs.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchGdItems = async (gdId) => {
    try {
      const res = await axios.get(`/api/gd-details/${gdId}`);
      setSelectedGd(res.data.gd);
      setItems(res.data.items);
      setShowConfirm(true);
      setStockedAt(new Date().toISOString().slice(0, 16));
    } catch (err) {
      console.error('Error fetching GD items:', err);
      toast.error('Failed to fetch GD details.');
    }
  };

  const processStockIn = async () => {
    if (!stockedBy.trim()) {
      toast.error('Please enter who is stocking this GD.');
      return;
    }
    try {
      await axios.post(`/api/stock/stock-in/${selectedGd.id}`, {
        stocked_by: stockedBy,
        stocked_at: new Date(stockedAt).toISOString(),
      });

      // Success feedback (banner + toast)
      setBanner({
        show: true,
        type: 'success',
        message: `✅ Stocked in GD #${selectedGd.gd_number} successfully.`,
      });
      setTimeout(() => setBanner({ show: false, type: 'success', message: '' }), 4000);
      toast.success('✅ Stocked in successfully!');

      setShowConfirm(false);
      setSelectedGd(null);
      setItems([]);
      fetchUnstocked();
    } catch (err) {
      setBanner({ show: true, type: 'danger', message: '❌ Failed to stock in.' });
      setTimeout(() => setBanner({ show: false, type: 'success', message: '' }), 4000);
      toast.error('❌ Failed to stock in.');
      console.error('Stock-in error:', err);
    }
  };

  // Keyboard shortcut: Enter opens first GD (when not typing and no modal shown)
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const isTyping = ['input', 'textarea', 'select'].includes(tag) || e.isComposing;
      if (isTyping || showConfirm) return;

      if (e.key === 'Enter' && gds.length > 0) {
        e.preventDefault();
        fetchGdItems(gds[0].id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gds, showConfirm]);

  useEffect(() => {
    fetchUnstocked();
  }, [fetchUnstocked]);

  return (
    <div className="stockin-page">
      <div className="overlay" aria-hidden />
      <Container fluid="lg" className="py-5">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h2 className="title m-0">Unstocked GDs</h2>
          <div className="d-flex align-items-center gap-2 small muted">
            <span className="d-none d-md-inline">Tip: Press <kbd>Enter</kbd> to open the first GD</span>
            <Button className="btn-ghost" onClick={fetchUnstocked} disabled={loading} aria-busy={loading}>
              {loading ? (
                <>
                  <Spinner size="sm" animation="border" className="me-2" /> Refreshing…
                </>
              ) : (
                '↻ Refresh'
              )}
            </Button>
          </div>
        </div>

        {banner.show && (
          <Alert
            variant={banner.type === 'success' ? 'success' : 'danger'}
            onClose={() => setBanner({ show: false, type: 'success', message: '' })}
            dismissible
            className="glass mb-3"
          >
            <strong>{banner.message}</strong>
          </Alert>
        )}

        <Card className="glass">
          <Card.Body className="p-0">
            <Table responsive hover className="table-darkish mb-0 text-center">
              <thead>
                <tr>
                  <th>GD Number</th>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="4" className="py-5">
                      <Spinner animation="border" />
                    </td>
                  </tr>
                ) : gds.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center py-4 ">
                      No unstocked GDs found.
                    </td>
                  </tr>
                ) : (
                  gds.map((gd, idx) => (
                    <tr key={gd.id} className={idx === 0 ? 'first-row' : ''}>
                      <td className="fw-semibold">{gd.gd_number}</td>
                      <td>{new Date(gd.gd_date).toLocaleDateString()}</td>
                      <td>{gd.supplier_name}</td>
                      <td>
                        <Button
                          size="sm"
                          className="btn-accent-outline"
                          onClick={() => fetchGdItems(gd.id)}
                        >
                          ➕ Process Stock In
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Card.Body>
        </Card>

        {/* Confirmation Modal */}
        <Modal
          show={showConfirm}
          onHide={() => setShowConfirm(false)}
          size="lg"
          centered
          scrollable
          contentClassName="modal-dark"
        >
          <Modal.Header closeButton className="modal-head">
            <Modal.Title>
              Confirm Stock In — GD #{selectedGd?.gd_number}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Card className="glass mb-3">
              <Card.Body>
                <Row className="g-3">
                  <Col md={6}>
                    <Form.Label className="muted">Stocked By</Form.Label>
                    <Form.Control
                      type="text"
                      placeholder="Enter your name"
                      className="input-dark"
                      value={stockedBy}
                      onChange={(e) => setStockedBy(e.target.value)}
                    />
                  </Col>
                  <Col md={6}>
                    <Form.Label className="muted">Date & Time</Form.Label>
                    <Form.Control
                      type="datetime-local"
                      className="input-dark"
                      value={stockedAt}
                      onChange={(e) => setStockedAt(e.target.value)}
                    />
                  </Col>
                </Row>
              </Card.Body>
            </Card>

            <Card className="glass">
              <Card.Header className="card-head">Items in GD</Card.Header>
              <Card.Body className="p-0">
                <Table bordered responsive className="table-darkish mb-0">
                  <thead>
                    <tr>
                      <th>Item ID</th>
                      <th>Description</th>
                      <th>HS Code</th>
                      <th>Quantity</th>
                      <th>Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
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
              </Card.Body>
            </Card>
          </Modal.Body>
          <Modal.Footer className="d-flex justify-content-between">
            <div className="small muted">
              <strong>GD:</strong> {selectedGd?.gd_number} &nbsp;|&nbsp;
              <strong>Date:</strong> {selectedGd ? new Date(selectedGd.gd_date).toLocaleDateString() : '-'} &nbsp;|&nbsp;
              <strong>Supplier:</strong> {selectedGd?.supplier_name || '-'}
            </div>
            <div>
              <Button className="btn-ghost me-2" onClick={() => setShowConfirm(false)}>
                Cancel
              </Button>
              <Button className="btn-accent" onClick={processStockIn}>
                ✅ Confirm Stock In
              </Button>
            </div>
          </Modal.Footer>
        </Modal>
      </Container>

      {/* Page styles */}
      <style>{`
        :root{
          --bg: #0d0d0d;
          --accent: #ff4c4c;
          --glass: rgba(255,255,255,0.06);
          --glass-strong: rgba(255,255,255,0.12);
          --border: rgba(255, 76, 76, 0.35);
          --muted: rgba(255,255,255,0.7);
          --text: #f5f5f5;
        }

        .stockin-page{
          position:relative;
          min-height:100vh;
          background: var(--bg);
          color: var(--text);
          padding: 2rem 0;
          overflow:hidden;
        }

        @media (prefers-reduced-motion: no-preference) {
          .stockin-page::before{
            content:"";
            position:absolute; inset:-100%;
            background: repeating-linear-gradient(120deg, rgba(255,76,76,.05) 0 2px, transparent 2px 20px);
            animation: bgMove 16s linear infinite;
            z-index:0;
          }
          @keyframes bgMove { to { transform: translate(-22%, -22%); } }
        }

        .overlay{
          position:absolute; inset:0;
          background: radial-gradient(1000px 600px at top left, rgba(255,76,76,.08), transparent 60%);
          z-index:1;
        }

        .title{
          position:relative; z-index:2; color: var(--accent);
          text-transform:uppercase; letter-spacing:2px; font-weight:800;
          text-shadow:0 2px 10px rgba(255,76,76,.45);
        }

        .glass{
          position:relative;
          background: var(--glass);
          border: 1px solid var(--border);
          box-shadow: 0 8px 24px rgba(255,76,76,.12);
          border-radius: 16px;
          z-index:2;
          backdrop-filter: blur(10px);
        }

        .table-darkish{
          color: var(--text);
        }
        .table-darkish thead tr{
          background: var(--glass-strong);
        }
        .table-darkish tbody tr{
          background: rgba(255,255,255,0.02);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .table-darkish tbody tr:hover{
          background: rgba(255,76,76,0.10);
        }
        .first-row td { border-top: 2px solid var(--accent); }

        .btn-accent{
          background: var(--accent);
          border: 1px solid var(--accent);
          color: #fff;
          font-weight: 700;
          letter-spacing:.5px;
          transition: transform .15s ease, box-shadow .15s ease, opacity .15s ease;
        }
        .btn-accent:hover{ transform: translateY(-1px); box-shadow:0 10px 20px rgba(255,76,76,.35); }
        .btn-accent:active{ transform: translateY(0); }

        .btn-accent-outline{
          background: transparent;
          border: 1px solid var(--accent);
          color: var(--accent);
          font-weight:700;
        }
        .btn-accent-outline:hover{
          background: rgba(255,76,76,0.15);
          color: #fff;
          box-shadow:0 8px 18px rgba(255,76,76,.3);
        }

        .btn-ghost{
          background: rgba(255,255,255,0.06);
          border: 1px solid var(--border);
          color: #fff;
        }
        .btn-ghost:hover{
          background: rgba(255,76,76,0.15);
          border-color: var(--accent);
          color:#fff;
        }

        .input-dark{
          background: rgba(255,255,255,0.06) !important;
          border: 1px solid rgba(255,255,255,0.15) !important;
          color: #fff !important;
        }
        .input-dark::placeholder{ color: rgba(255,255,255,0.6) !important; }
        .input-dark:focus{
          border-color: var(--accent) !important;
          box-shadow: 0 0 0 0.2rem rgba(255,76,76,0.25) !important;
          background: rgba(255,255,255,0.10) !important;
        }

        .muted{ color: var(--muted) !important; }
        .modal-dark{
          background: var(--bg);
          color: #fff;
          border: 1px solid var(--border);
          box-shadow: 0 20px 60px rgba(0,0,0,.6);
        }
        .modal-head{
          background: rgba(255,76,76,0.18);
          color: #fff;
          border-bottom: 1px solid var(--border);
        }

        .table > :not(caption) > * > * { border-color: rgba(255,255,255,0.08) !important; }
        .form-control:disabled { opacity:.7; }
      `}</style>
    </div>
  );
};

export default StockInPage;
