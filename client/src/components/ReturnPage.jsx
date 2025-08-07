import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Container, Table, Form, Button,
  Row, Col, Alert, ListGroup, Modal
} from 'react-bootstrap';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function ReturnPage() {
  const [invoiceNo, setInvoiceNo] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [existingReturns, setExistingReturns] = useState([]);
  const [returns, setReturns] = useState({});
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [refundSummary, setRefundSummary] = useState(null);
  const [refundInCash, setRefundInCash] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const wrapperRef = useRef();

  useEffect(() => {
    const q = invoiceNo.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const timeout = setTimeout(() => {
      axios.get('/api/sales/invoice-suggestions', { params: { q } })
        .then(r => setSuggestions(r.data))
        .catch(() => setSuggestions([]));
    }, 300);
    return () => clearTimeout(timeout);
  }, [invoiceNo]);

  const loadInvoice = async (invNumber = invoiceNo) => {
    try {
      const [{ data: invRes }, { data: retRes }] = await Promise.all([
        axios.get(`/api/sales/invoice/${invNumber}`),
        axios.get(`/api/sales/invoice/${invNumber}/returns`)
      ]);
      setInvoiceItems(invRes.items);
      setExistingReturns(retRes);
      const init = {};
      invRes.items.forEach(i => {
        init[i.item_id] = { qty: 0, reason: '', restock: false };
      });
      setReturns(init);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invoice not found');
    }
  };

  const pickSuggestion = s => {
    setInvoiceNo(s.invoice_number);
    setSuggestions([]);
    loadInvoice(s.invoice_number);
  };

  const onReturnChange = (itemId, field, value) => {
    setReturns(r => ({
      ...r,
      [itemId]: { ...r[itemId], [field]: value }
    }));
  };

  const handleClickOutside = e => {
    if (!wrapperRef.current?.contains(e.target)) {
      setSuggestions([]);
    }
  };

  useEffect(() => {
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const calculateRefundSummary = () => {
    let refund = 0;
    let tax = 0;
    invoiceItems.forEach(it => {
      const v = returns[it.item_id];
      if (v?.qty > 0) {
        refund += v.qty * it.sale_rate;
        tax += v.qty * it.retail_price * 0.18;
      }
    });
    return { refund, tax, total: refund + tax };
  };

  const validateBeforeSubmit = () => {
    const hasItems = Object.values(returns).some(v => v.qty > 0);
    if (!hasItems) {
      toast.warn('Please select at least one item to return');
      return;
    }
    setShowConfirmModal(true);
  };

  const finalizeReturn = async () => {
    const itemsToReturn = invoiceItems
      .filter(it => returns[it.item_id]?.qty > 0)
      .map(it => ({
        invoice_item_id: it.id,
        item_id: it.item_id,
        quantity_returned: returns[it.item_id].qty,
        reason: returns[it.item_id].reason,
        restock: returns[it.item_id].restock,
        gd_entry_id: it.gd_entry_id,
        refund_amount: it.sale_rate * returns[it.item_id].qty,
        refund_tax: it.retail_price * 0.18 * returns[it.item_id].qty,
        cost: it.cost || 0,
        mrp: it.retail_price
      }));

    try {
      const { data } = await axios.post('/api/sales/returns', {
        invoice_number: invoiceNo,
        items: itemsToReturn,
        refund_method: refundInCash ? 'cash' : 'withholding'
      });

      toast.success('Return processed!');
      setRefundSummary({ ...data, refundInCash });
      setReturns({});
      setShowConfirmModal(false);
      loadInvoice();

      if (data.fullyReturned) {
        setShowDeleteModal(true);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Return failed');
    }
  };

  const summary = calculateRefundSummary();

  return (
    <Container className="my-4">
      <ToastContainer />
      <div ref={wrapperRef} style={{ position: 'relative' }}>
        <Row className="mb-3 justify-content-center">
          <Col md={6}>
            <Form.Control
              size="lg"
              placeholder="Enter Invoice # or Customer"
              value={invoiceNo}
              onChange={e => setInvoiceNo(e.target.value)}
              className="text-center"
            />
          </Col>
          <Col md="auto">
            <Button size="lg" onClick={() => loadInvoice()}>Load</Button>
          </Col>
        </Row>
        {suggestions.length > 0 && (
          <ListGroup style={{ position: 'absolute', top: '100%', width: '100%', zIndex: 1000 }}>
            {suggestions.map(s => (
              <ListGroup.Item
                key={s.invoice_number}
                action
                onClick={() => pickSuggestion(s)}
              >
                <strong>{s.invoice_number}</strong> — {s.customer_name}
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}
      </div>

      {existingReturns.length > 0 && (
        <Alert variant="info">
          {existingReturns.length} return(s) have already been recorded for this invoice.
        </Alert>
      )}

      {invoiceItems.length > 0 && (
        <>
          <Table bordered className="mt-3">
            <thead>
              <tr>
                <th>Description</th>
                <th>Sold</th>
                <th>Return Qty</th>
                <th>Reason</th>
                <th>Restock?</th>
              </tr>
            </thead>
            <tbody>
              {invoiceItems.map(it => {
                const returnedQty = existingReturns
                  .filter(r => r.item_id === it.item_id)
                  .reduce((sum, r) => sum + parseFloat(r.quantity_returned || 0), 0);
                const maxQty = parseFloat(it.quantity_sold) - returnedQty;
                const { qty, reason, restock } = returns[it.item_id] || {};
                return (
                  <tr key={it.item_id}>
                    <td>{it.description}</td>
                    <td>{it.quantity_sold} (returned {returnedQty})</td>
                    <td>
                      <Form.Control
                        type="number"
                        min={0}
                        max={maxQty}
                        value={qty || 0}
                        onChange={e =>
                          onReturnChange(it.item_id, 'qty', parseFloat(e.target.value || 0))
                        }
                      />
                    </td>
                    <td>
                      <Form.Control
                        value={reason || ''}
                        onChange={e =>
                          onReturnChange(it.item_id, 'reason', e.target.value)
                        }
                      />
                    </td>
                    <td className="text-center">
                      <Form.Check
                        type="checkbox"
                        checked={restock || false}
                        onChange={e =>
                          onReturnChange(it.item_id, 'restock', e.target.checked)
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          <div className="text-end">
            <p><strong>Refund:</strong> Rs. {summary.refund.toFixed(2)}</p>
            <p><strong>Tax Reversal:</strong> Rs. {summary.tax.toFixed(2)}</p>
            <h5 className="text-success">Total: Rs. {summary.total.toFixed(2)}</h5>
          </div>

          <Button variant="primary" onClick={validateBeforeSubmit}>
            Proceed to Return
          </Button>
        </>
      )}

      {/* Confirm Return Modal */}
      <Modal show={showConfirmModal} onHide={() => setShowConfirmModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Return</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Total Refund Amount: <strong>Rs. {summary.total.toFixed(2)}</strong></p>
          <Form.Check
            type="radio"
            label="Give cash refund now (no withholding)"
            name="refundOption"
            checked={refundInCash}
            onChange={() => setRefundInCash(true)}
          />
          <Form.Check
            type="radio"
            label="Add refund amount to customer credit / withholding"
            name="refundOption"
            checked={!refundInCash}
            onChange={() => setRefundInCash(false)}
            className="mt-2"
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowConfirmModal(false)}>Cancel</Button>
          <Button variant="success" onClick={finalizeReturn}>Confirm Return</Button>
        </Modal.Footer>
      </Modal>

      {/* Refund Summary */}
      <Modal show={!!refundSummary} onHide={() => setRefundSummary(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Return Completed</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p><strong>Refund:</strong> Rs. {refundSummary?.refundAmount.toFixed(2)}</p>
          <p><strong>Tax Reversal:</strong> Rs. {refundSummary?.refundTax.toFixed(2)}</p>
          <hr />
          <h5>Total Credited:</h5>
          <p className="fs-4 text-success">Rs. {(refundSummary?.refundAmount + refundSummary?.refundTax).toFixed(2)}</p>
          <p>
            Method: <strong>{refundSummary?.refundInCash ? 'Cash Given' : 'Withholding / Credit'}</strong>
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => window.print()}>
            🖸️ Print Receipt
          </Button>
          <Button variant="success" onClick={() => setRefundSummary(null)}>
            Done
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Delete Invoice Modal */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Delete Invoice?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          All items in this invoice were returned. Do you want to delete this invoice?
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="danger"
            onClick={async () => {
              try {
                await axios.delete(`/api/sales/invoice/${invoiceNo}`);
                toast.success("Invoice deleted.");
                setShowDeleteModal(false);
                setInvoiceNo('');
                setInvoiceItems([]);
                setExistingReturns([]);
                setReturns({});
              } catch (err) {
                toast.error("Failed to delete invoice: " + (err.response?.data?.error || err.message));
              }
            }}
          >
            Yes, Delete
          </Button>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}