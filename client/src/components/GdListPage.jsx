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


  const taxRate = 0.35;

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
    const perUnitProfit = (incomeTax / taxRate) / quantity;
    const salePrice = cost + perUnitProfit;

    return {
      retail_price: retailPrice.toFixed(2),
      per_unit_sales_tax: perUnitSalesTax.toFixed(2),
      mrp: mrp.toFixed(2),
      gross_margin: grossMargin.toFixed(2),
      sale_price: salePrice.toFixed(2)
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
  
      const payload = { items: [updatedItem] };
  
      await axios.put(`http://localhost:5000/api/gd-items/${selectedGdId}`, payload);
  
      // Refresh GD details
      await openGdModal(selectedGdId);
  
      // ✅ Show success modal
      setSaveModal({
        show: true,
        type: 'success',
        message: `✅ Item ${index + 1} updated successfully!`
      });
    } catch (error) {
      console.error('Save error:', error);
  
      // ❌ Show error modal
      setSaveModal({
        show: true,
        type: 'danger',
        message: `❌ Failed to update item ${index + 1}`
      });
    } finally {
      setSavingIndexes(prev => ({ ...prev, [index]: false }));
  
      // Auto-close modal after 3 seconds
      setTimeout(() => {
        setSaveModal({ show: false, type: '', message: '' });
      }, 3000);
    }
  };
  
  
  const editableFields = [
    "description", "hs_code", "quantity", "unit_price", "total_value", "total_custom_value",
    "invoice_value", "unit_cost", "unit", "gross_weight", "custom_duty", "sales_tax", "gst",
    "ast", "income_tax", "acd", "regulatory_duty", "landed_cost", "retail_price",
    "per_unit_sales_tax", "mrp", "cost", "gross_margin", "sale_price"
  ];

  return (
    <div style={{ background: 'linear-gradient(to bottom right, rgb(81, 70, 70), rgb(97, 34, 34))', minHeight: '100vh' }}>
      <Container className="py-5 text-light" style={{ background: 'linear-gradient(to bottom right, #ece2e2, rgb(159, 141, 141))' }}>
        <h2 className="text-center mb-4">GD Records</h2>

        <Card className="mb-4 shadow-lg">
          <Card.Body>
            <Row className="g-3">
              <Col md={3}><Form.Control name="gd_number" placeholder="GD Number" value={filters.gd_number} onChange={handleFilterChange} /></Col>
              <Col md={2}><Form.Control type="date" name="gd_date" value={filters.gd_date} onChange={handleFilterChange} /></Col>
              <Col md={3}><Form.Control name="supplier_name" placeholder="Supplier" value={filters.supplier_name} onChange={handleFilterChange} /></Col>
              <Col md={2}><Form.Control name="hs_code" placeholder="HS Code" value={filters.hs_code} onChange={handleFilterChange} /></Col>
              <Col md={2} className="d-grid">
                <Button variant="outline-dark" onClick={handleSearch}>🔍 Search</Button>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        <Card className="shadow-sm border-0">
          <Card.Body className="p-0">
            <Table striped hover responsive className="mb-0 table-bordered table-hover text-center" style={{ backgroundColor: 'white' }}>
              <thead className="table-light text-dark">
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
                  <tr><td colSpan="6" className="text-center py-4 text-light">No GD entries found.</td></tr>
                ) : (
                  gds.map(gd => (
                    <tr key={gd.id}>
                      <td>{gd.gd_number}</td>
                      <td>{new Date(gd.gd_date).toLocaleDateString()}</td>
                      <td>{gd.supplier_name}</td>
                      <td>{gd.item_count}</td>
                      <td>{Number(gd.landed_cost).toFixed(2)}</td>
                      <td>
                        <Button size="sm" variant="light" onClick={() => openGdModal(gd.id)}>
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

        {/* MODAL */}
        <Modal show={showModal} onHide={() => setShowModal(false)} size="xl" centered scrollable>
          <Modal.Header closeButton className="bg-primary text-dark">
            <Modal.Title style={{ color: "black" }}>GD Details - {gdDetails?.gd?.gd_number}</Modal.Title>
          </Modal.Header>
          <Modal.Body style={{ backgroundColor: '#fefefe' }}>
            {alert.show && (
              <Alert variant={alert.type} onClose={() => setAlert({ ...alert, show: false })} dismissible>
                {alert.message}
              </Alert>
            )}

            {gdDetails ? (
              <>
                <div className="mb-3">
                  <strong>Date:</strong> {new Date(gdDetails.gd.gd_date).toLocaleDateString()} <br />
                  <strong>Supplier:</strong> {gdDetails.gd.supplier_name} <br />
                  <strong>Avg Landed Cost:</strong> Rs {gdDetails.gd.landed_cost}
                </div>

                <Form.Control
                  className="mb-4"
                  placeholder="🔍 Search items by description or HS code"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ color: 'black' }}
                />

                {gdDetails.items.map((item, index) => {
                  const isVisible = item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    item.hs_code?.toLowerCase().includes(searchTerm.toLowerCase());

                  if (!isVisible && searchTerm) return null;

                  return (
                    <Card className="mb-4 shadow-sm" key={index} style={{ backgroundColor: '#f8f9fa' }}>
                      <Card.Header className="bg-dark text-light">Item #{index + 1}</Card.Header>
                      <Card.Body>
                        <Row>
                          {[0, 1].map(col => (
                            <Col md={6} key={col}>
                              <Table bordered size="sm">
                                <tbody>
                                  {editableFields.slice(col * editableFields.length / 2, (col + 1) * editableFields.length / 2).map(field => (
                                    <tr key={field}>
                                      <th>{field.replace(/_/g, ' ').toUpperCase()}</th>
                                      <td>
                                        <Form.Control
                                          name={field}
                                          value={item[field] || ''}
                                          onChange={(e) => handleItemChange(index, e)}
                                          type="text"
                                          step="any"
                                          readOnly={["retail_price", "per_unit_sales_tax", "mrp", "cost", "gross_margin"].includes(field)}
                                          className={
                                            field === "gross_margin" ? (item.gross_margin > 0 ? "text-success fw-bold" : "text-danger fw-bold") :
                                              field === "sale_price" ? "fw-bold text-primary" : ""
                                          }
                                          style={{ color: 'black' }}
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
                            variant="outline-success"
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
                <Card>
                  <ListGroup variant="flush">
                    {gdDetails.charges.map((c, i) => (
                      <ListGroup.Item key={i}>
                        <strong>{c.charge_type}</strong>: Rs {c.charge_amount}
                      </ListGroup.Item>
                    ))}
                  </ListGroup>
                </Card>
              </>
            ) : (
              <div className="text-center py-5"><Spinner animation="border" /></div>
            )}
          </Modal.Body>
        </Modal>
        <Modal
  show={saveModal.show}
  onHide={() => setSaveModal({ show: false, type: '', message: '' })}
  centered
  backdrop="static"
  keyboard={false}
>
  <Modal.Header closeButton className={saveModal.type === 'success' ? 'bg-success' : 'bg-danger'}>
    <Modal.Title className="text-white">
      {saveModal.type === 'success' ? '✅ Success' : '❌ Error'}
    </Modal.Title>
  </Modal.Header>
  <Modal.Body className="text-center fw-bold" style={{ fontSize: '1.2rem' }}>
    {saveModal.message}
  </Modal.Body>
</Modal>

      </Container>
    </div>
  );
};

export default GdListPage;
