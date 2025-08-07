import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import {
  Container, Row, Col, Table, Form, Button, Spinner, Card, ListGroup
} from 'react-bootstrap';

const GdDetailsPage = () => {
  const { id } = useParams();
  const [gd, setGd] = useState(null);
  const [items, setItems] = useState([]);
  const [charges, setCharges] = useState([]);
  const [savingIndexes, setSavingIndexes] = useState({});
  const [taxRate, setTaxRate] = useState(0.35); // 👈 Editable TAX RATE
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    axios.get(`http://localhost:5000/api/gd-details/${id}`)
      .then(res => {
        setGd(res.data.gd);
        setItems(res.data.items);
        setCharges(res.data.charges);
      });
  }, [id]);

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
    const updated = [...items];
    updated[index][e.target.name] = e.target.value;

    const recomputed = recalculateDerivedFields(updated[index]);
    updated[index] = { ...updated[index], ...recomputed };

    setItems(updated);
  };

  const handleTaxRateChange = (e) => {
    const newRate = parseFloat(e.target.value);
    setTaxRate(newRate);

    const updated = items.map(item => ({
      ...item,
      ...recalculateDerivedFields(item)
    }));
    setItems(updated);
  };

  const handleSaveItem = async (index) => {
    try {
      setSavingIndexes(prev => ({ ...prev, [index]: true }));
      const updatedItem = items[index];
      await axios.put(`http://localhost:5000/api/gd-items/${id}`, { items: [updatedItem] });
      alert(`Item ${index + 1} updated successfully!`);
    } catch (error) {
      alert(`Failed to update item ${index + 1}`);
      console.error(error);
    } finally {
      setSavingIndexes(prev => ({ ...prev, [index]: false }));
    }
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value.toLowerCase());
  };

  const filteredItems = items.filter(item =>
    item.description?.toLowerCase().includes(searchQuery) ||
    item.hs_code?.toLowerCase().includes(searchQuery)
  );

  if (!gd) {
    return <div className="text-center py-5"><Spinner animation="border" /></div>;
  }

  const editableFields = [
    "description", "hs_code", "quantity", "unit_price", "total_value", "total_custom_value",
    "invoice_value", "unit_cost", "unit", "gross_weight", "custom_duty", "sales_tax", "gst",
    "ast", "income_tax", "acd", "regulatory_duty", "landed_cost", "retail_price",
    "per_unit_sales_tax", "mrp", "cost", "gross_margin", "sale_price"
  ];

  return (
    <Container className="myDetails">
      <h2 className="mb-3" style={{ color: 'white' }}>GD Details - {gd.gd_number}</h2>

      <Card className="mb-4">
        <Link to="/gd-list" className="btn btn-outline-light mb-3" style={{ backgroundColor: 'grey' }}>← Back to GD List</Link>
        <Card.Body>
          <Row>
            <Col md={4}><strong>Date:</strong> {new Date(gd.gd_date).toLocaleDateString()}</Col>
            <Col md={4}><strong>Supplier:</strong> {gd.supplier_name}</Col>
            <Col md={4}><strong>Avg Landed Cost:</strong> Rs {Number(gd.landed_cost)?.toFixed(2)}</Col>
          </Row>
        </Card.Body>
      </Card>

      <Form.Group className="mb-4">
        <Form.Label style={{ color: 'white' }}><strong>Income Tax Rate</strong></Form.Label>
        <Form.Control
          type="number"
          step="0.01"
          min="0.01"
          max="1"
          value={taxRate}
          onChange={handleTaxRateChange}
          style={{ width: '200px' }}
        />
      </Form.Group>
      <Row className="justify-content-center mb-4">
  <Col md={8} lg={6}>
    <Form.Group controlId="searchItems">
      <Form.Label className="text-center d-block" style={{ color: 'white', fontSize: '1.25rem' }}>
        <strong>Search Item (by Description or HS Code)</strong>
      </Form.Label>
      <Form.Control
        type="text"
        placeholder="Type description or HS code..."
        value={searchQuery}
        onChange={handleSearchChange}
        className="form-control-lg text-center"
        style={{ fontSize: '1.1rem' }}
      />
    </Form.Group>
  </Col>
</Row>


      <h4 className="mb-3" style={{ color: 'white' }}>Editable Items</h4>
      {filteredItems.map((item, i) => {
        const leftFields = editableFields.slice(0, Math.ceil(editableFields.length / 2));
        const rightFields = editableFields.slice(Math.ceil(editableFields.length / 2));

        return (
          <Card className="mb-4" key={i}>
            <Card.Header>Item #{i + 1} - ID: {item.item_id}</Card.Header>
            <Card.Body>
              <Row>
                {[leftFields, rightFields].map((fields, colIdx) => (
                  <Col md={6} key={colIdx}>
                    <Table bordered>
                      <tbody>
                        {fields.map(field => (
                          <tr key={field}>
                            <th>{field.replace(/_/g, ' ').toUpperCase()}</th>
                            <td>
                              <Form.Control
                                name={field}
                                value={item[field] || ''}
                                onChange={(e) => handleItemChange(i, e)}
                                type={["quantity", "unit_price", "total_value", "custom_duty", "income_tax", "acd", "regulatory_duty", "landed_cost", "retail_price", "sale_price", "mrp", "cost", "gross_margin"].includes(field) ? "number" : "text"}
                                step="any"
                                readOnly={["retail_price", "per_unit_sales_tax", "mrp", "cost", "gross_margin"].includes(field)}
                                className={
                                  field === "gross_margin" ? (item.gross_margin > 0 ? "text-success fw-bold" : "text-danger fw-bold")
                                    : field === "sale_price" ? "fw-bold"
                                      : ""
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
                  variant="primary"
                  onClick={() => handleSaveItem(i)}
                  disabled={savingIndexes[i]}
                >
                  {savingIndexes[i] ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </Card.Body>
          </Card>
        );
      })}

      <h4 className="my-5">Associated Charges</h4>
      <Card>
        <ListGroup variant="flush">
          {charges.map((c, i) => (
            <ListGroup.Item key={i}>
              <strong>{c.charge_type}</strong>: Rs {c.charge_amount}
            </ListGroup.Item>
          ))}
        </ListGroup>
      </Card>
    </Container>
  );
};

export default GdDetailsPage;
