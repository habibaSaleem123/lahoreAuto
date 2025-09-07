// src/components/GdListPage.js
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Button, Card, Col, Container, Form, Modal, Row, Spinner, Table, ListGroup, Alert
} from 'react-bootstrap';

const GdListPage = () => {
  const [filters, setFilters] = useState({ gd_number: '', gd_date: '', supplier_name: '', hs_code: '' });
  const [gds, setGds] = useState([]);
  const [selectedGdId, setSelectedGdId] = useState(null);
  const [gdDetails, setGdDetails] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [savingIndexes, setSavingIndexes] = useState({});
  const [alert, setAlert] = useState({ show: false, type: '', message: '' });
  const [saveModal, setSaveModal] = useState({ show: false, type: '', message: '' });

  // Server default is 0.35, keep UI in sync:
  const taxRate = 0.35;

  // ✅ Numeric fields that should display with 2 decimals
  const DECIMAL_FIELDS = new Set([
    'quantity', 'unit_price', 'total_value', 'total_custom_value', 'invoice_value', 'unit_cost',
    'gross_weight', 'custom_duty', 'sales_tax', 'gst', 'ast', 'income_tax', 'acd',
    'regulatory_duty', 'landed_cost', 'retail_price', 'per_unit_sales_tax', 'mrp',
    'cost', 'gross_margin', 'sale_price'
  ]);

  // ✅ Safe 2-dec formatter for UI display
  const to2 = (v) => {
    if (v === '' || v === null || v === undefined) return '';
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(2) : v;
  };

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const params = new URLSearchParams(filters);
      const res = await axios.get(`http://localhost:5000/api/gd-list?${params.toString()}`);
      setGds(res.data);
    } catch (error) {
      console.error('Error fetching GD list:', error);
    }
  };

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const handleSearch = () => fetchData();

  const openGdModal = async (gdId) => {
    try {
      const res = await axios.get(`http://localhost:5000/api/gd-details/${gdId}`);
      setGdDetails(res.data);
      setSelectedGdId(gdId);
      setShowModal(true);
    } catch (err) {
      console.error('Error fetching GD details:', err);
    }
  };

  const recalculateDerivedFields = (item) => {
    const quantity = Number(item.quantity || 1);
    const totalTax = Number(item.sales_tax || 0) + Number(item.gst || 0) + Number(item.ast || 0);
    const perUnitSalesTax = totalTax / quantity;
    const retailPrice = perUnitSalesTax / 0.18;
    const mrp = retailPrice + perUnitSalesTax;

    const cost = Number(item.cost || 0);
    const grossMargin = retailPrice - cost;

    const incomeTax = Number(item.income_tax || 0);
    const perUnitProfit = (taxRate > 0 ? (incomeTax / taxRate) : 0) / quantity;
    let salePrice = cost + perUnitProfit;

    // ✅ Over-retail fallback: cost + 0.9 * (retail - cost)
    if (salePrice > retailPrice) {
      salePrice = cost + 0.9 * (retailPrice - cost);
    }

    return {
      retail_price: to2(retailPrice),
      per_unit_sales_tax: to2(perUnitSalesTax),
      mrp: to2(mrp),
      gross_margin: to2(grossMargin),
      sale_price: to2(salePrice)
    };
  };

  const handleItemChange = (index, e) => {
    const updated = [...gdDetails.items];
    updated[index][e.target.name] = e.target.value;
    const recomputed = recalculateDerivedFields(updated[index]);
    updated[index] = { ...updated[index], ...recomputed };
    setGdDetails({ ...gdDetails, items: updated });
  };

  const handleSaveItem = async (index) => {
    try {
      setSavingIndexes(prev => ({ ...prev, [index]: true }));
      const updatedItem = gdDetails.items[index];
      const payload = { items: [updatedItem], taxRate }; // send taxRate for server-side consistency
      await axios.put(`http://localhost:5000/api/gd-items/${selectedGdId}`, payload);

      // Refresh details after save
      await openGdModal(selectedGdId);

      setSaveModal({
        show: true,
        type: 'success',
        message: `✅ Item ${index + 1} updated successfully!`
      });
    } catch (error) {
      console.error('Save error:', error);
      setSaveModal({
        show: true,
        type: 'danger',
        message: `❌ Failed to update item ${index + 1}`
      });
    } finally {
      setSavingIndexes(prev => ({ ...prev, [index]: false }));
      setTimeout(() => setSaveModal({ show: false, type: '', message: '' }), 3000);
    }
  };

  const editableFields = [
    'description', 'hs_code', 'quantity', 'unit_price', 'total_value', 'total_custom_value',
    'invoice_value', 'unit_cost', 'unit', 'gross_weight', 'custom_duty', 'sales_tax', 'gst',
    'ast', 'income_tax', 'acd', 'regulatory_duty', 'landed_cost', 'retail_price',
    'per_unit_sales_tax', 'mrp', 'cost', 'gross_margin', 'sale_price'
  ];

  return (
    <div className="gd-page">
      <div className="overlay" aria-hidden />
      <Container fluid="lg" className="py-5">
        <h2 className="title text-center mb-4">GD Records</h2>

        {/* Filters */}
        <Card className="glass mb-4">
          <Card.Body>
            <Row className="g-3 align-items-end">
              <Col md={3}>
                <Form.Label className="muted">GD Number</Form.Label>
                <Form.Control
                  name="gd_number"
                  placeholder="Enter GD Number"
                  value={filters.gd_number}
                  onChange={handleFilterChange}
                  className="input-dark"
                />
              </Col>
              <Col md={2}>
                <Form.Label className="muted">Date</Form.Label>
                <Form.Control
                  type="date"
                  name="gd_date"
                  value={filters.gd_date}
                  onChange={handleFilterChange}
                  className="input-dark"
                />
              </Col>
              <Col md={3}>
                <Form.Label className="muted">Supplier</Form.Label>
                <Form.Control
                  name="supplier_name"
                  placeholder="Supplier name"
                  value={filters.supplier_name}
                  onChange={handleFilterChange}
                  className="input-dark"
                />
              </Col>
              <Col md={2}>
                <Form.Label className="muted">HS Code</Form.Label>
                <Form.Control
                  name="hs_code"
                  placeholder="HS Code"
                  value={filters.hs_code}
                  onChange={handleFilterChange}
                  className="input-dark"
                />
              </Col>
              <Col md={2} className="d-grid">
                <Button className="btn-accent" onClick={handleSearch}>
                  🔍 Search
                </Button>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {/* List */}
        <Card className="glass">
          <Card.Body className="p-0">
            <Table responsive hover className="table-darkish mb-0 text-center">
              <thead>
                <tr>
                  <th>GD Number</th>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th>Items</th>
                  <th>Avg Cost</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {gds.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-4 muted">No GD entries found.</td>
                  </tr>
                ) : (
                  gds.map(gd => (
                    <tr key={gd.id}>
                      <td>{gd.gd_number}</td>
                      <td>{new Date(gd.gd_date).toLocaleDateString()}</td>
                      <td>{gd.supplier_name}</td>
                      <td>{gd.item_count}</td>
                      <td>{Number(gd.landed_cost).toFixed(2)}</td>
                      <td>
                        <Button size="sm" className="btn-ghost" onClick={() => openGdModal(gd.id)}>
                          View
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Card.Body>
        </Card>

        {/* Details Modal */}
        <Modal
          show={showModal}
          onHide={() => setShowModal(false)}
          size="xl"
          centered
          scrollable
          contentClassName="modal-dark"
        >
          <Modal.Header closeButton className="modal-head">
            <Modal.Title>GD Details — {gdDetails?.gd?.gd_number}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {alert.show && (
              <Alert
                variant={alert.type}
                onClose={() => setAlert({ ...alert, show: false })}
                dismissible
              >
                {alert.message}
              </Alert>
            )}

            {gdDetails ? (
              <>
                <div className="mb-4 small muted">
                  <strong className="muted-strong">Date:</strong> {new Date(gdDetails.gd.gd_date).toLocaleDateString()} &nbsp;|&nbsp;
                  <strong className="muted-strong">Supplier:</strong> {gdDetails.gd.supplier_name} &nbsp;|&nbsp;
                  <strong className="muted-strong">Avg Landed Cost:</strong> Rs {to2(gdDetails.gd.landed_cost)}
                </div>

                <Form.Control
                  className="input-dark mb-4"
                  placeholder="🔍 Search items by description or HS code"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />

                {gdDetails.items.map((item, index) => {
                  const term = searchTerm.trim().toLowerCase();
                  const isVisible =
                    !term ||
                    item.description?.toLowerCase().includes(term) ||
                    item.hs_code?.toLowerCase().includes(term);

                  if (!isVisible) return null;

                  return (
                    <Card className="glass mb-4" key={index}>
                      <Card.Header className="card-head">
                        Item #{index + 1}
                      </Card.Header>
                      <Card.Body>
                        <Row>
                          {[0, 1].map(col => (
                            <Col md={6} key={col}>
                              <Table bordered size="sm" className="table-compact">
                                <tbody>
                                  {editableFields
                                    .slice(col * editableFields.length / 2, (col + 1) * editableFields.length / 2)
                                    .map(field => (
                                      <tr key={field}>
                                        <th className="muted">{field.replace(/_/g, ' ').toUpperCase()}</th>
                                        <td>
                                          <Form.Control
                                            name={field}
                                            value={DECIMAL_FIELDS.has(field) ? to2(item[field]) : (item[field] ?? '')}
                                            onChange={(e) => handleItemChange(index, e)}
                                            type="text"
                                            step="any"
                                            readOnly={["retail_price", "per_unit_sales_tax", "mrp", "cost", "gross_margin"].includes(field)}
                                            className={
                                              "input-dark " +
                                              (field === "gross_margin"
                                                ? (Number(item.gross_margin) > 0 ? "text-success fw-bold" : "text-danger fw-bold")
                                                : field === "sale_price" ? "fw-bold" : "")
                                            }
                                          />
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </Table>
                            </Col>
                          ))}
                        </Row>
                        <div className="text-end">
                          <Button
                            className="btn-accent-outline"
                            onClick={() => handleSaveItem(index)}
                            disabled={savingIndexes[index]}
                          >
                            {savingIndexes[index] ? "Saving..." : "💾 Save Changes"}
                          </Button>
                        </div>
                      </Card.Body>
                    </Card>
                  );
                })}

                <h5 className="mt-4">Associated Charges</h5>
                <Card className="glass">
                  <ListGroup variant="flush">
                    {gdDetails.charges.map((c, i) => (
                      <ListGroup.Item className="list-dark" key={i}>
                        <strong>{c.charge_type}</strong>: Rs {to2(c.charge_amount)}
                      </ListGroup.Item>
                    ))}
                  </ListGroup>
                </Card>
              </>
            ) : (
              <div className="text-center py-5">
                <Spinner animation="border" />
              </div>
            )}
          </Modal.Body>
        </Modal>

        {/* Save feedback modal */}
        <Modal
          show={saveModal.show}
          onHide={() => setSaveModal({ show: false, type: '', message: '' })}
          centered
          backdrop="static"
          keyboard={false}
          contentClassName="modal-feedback"
        >
          <Modal.Header closeButton className={saveModal.type === 'success' ? 'bg-success' : 'bg-danger'}>
            <Modal.Title className="text-white">
              {saveModal.type === 'success' ? '✅ Success' : '❌ Error'}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body className="text-center fw-bold" style={{ fontSize: '1.1rem' }}>
            {saveModal.message}
          </Modal.Body>
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
          --text:rgb(16, 8, 8);
        }

        .gd-page{
          position:relative;
          min-height:100vh;
          background: var(--bg);
          color: var(--text);
          padding: 2rem 0;
          overflow:hidden;
        }
        @media (prefers-reduced-motion: no-preference) {
          .gd-page::before{
            content:"";
            position:absolute; inset:-100%;
            background:
              repeating-linear-gradient(120deg, rgba(255,76,76,.05) 0 2px, transparent 2px 20px);
            animation: bgMove 16s linear infinite;
            z-index:0;
          }
          @keyframes bgMove { to { transform: translate(-22%, -22%); } }
        }
        .overlay{ position:absolute; inset:0; background: radial-gradient(1000px 600px at top left, rgba(255,76,76,.08), transparent 60%); z-index:1; }

        .title{ position:relative; z-index:2; color: var(--accent); text-transform:uppercase; letter-spacing:2px; font-weight:800; text-shadow:0 2px 10px rgba(255,76,76,.45); }

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
        .table-compact th, .table-compact td{ vertical-align: middle; }

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
          color: var(--text);
        }
        .btn-ghost:hover{
          background: rgba(255,76,76,0.15);
          border-color: var(--accent);
          color:#fff;
        }

        .input-dark{
          background: rgba(207, 198, 198, 0.5) !important;
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
        .muted-strong{ color: #fff; }

        .card-head{
          background: rgba(255,76,76,0.12);
          color: #fff;
          border-bottom: 1px solid var(--border);
          font-weight:700;
        }

        .list-dark{
          background: rgba(255,255,255,0.03);
          color: #fff;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }

        .modal-dark{
          background: var(--bg);
          color: #fff;
          border: 1px solid var(--border);
          box-shadow: 0 20px 60px rgba(0,0,0,.6);
        }
        .modal-head{
          background: rgba(255,76,76,0.18);
          color: white !important;
          border-bottom: 1px solid var(--border);
        }
        .modal-head { color: white !important; }
        .modal-head .modal-title { color: white !important; }

        .modal-feedback{
          background: var(--bg);
          color: #fff;
          border: 1px solid var(--border);
        }
        .modal-body .card {
          background-color: white !important;
          color: black !important;
        }

        .modal-body .card * {
          color: black !important;
        }

        /* Bootstrap fix-ups on dark bg */
        .table > :not(caption) > * > * { border-color: rgba(255,255,255,0.08) !important; }
        .form-control, .form-select { color:#fff; }
        .form-control:disabled { opacity:.7; }
      `}</style>
    </div>
  );
};

export default GdListPage;
