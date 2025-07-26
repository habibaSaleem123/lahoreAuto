// src/components/ReturnPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Container, Table, Form, Button,
  Row, Col, Alert, ListGroup
} from 'react-bootstrap';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function ReturnPage() {
  const [invoiceNo, setInvoiceNo]       = useState('');
  const [suggestions, setSuggestions]   = useState([]);
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [existingReturns, setExistingReturns] = useState([]);
  const [returns, setReturns]           = useState({});

  const wrapperRef = useRef();

  // 1️⃣ Fetch matching invoices/customers as you type
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
    }, 200); // debounce 200ms

    return () => clearTimeout(timeout);
  }, [invoiceNo]);

  // 2️⃣ Load invoice + existing returns
  const loadInvoice = async (invNumber = invoiceNo) => {
    try {
      const [{ data: invRes }, { data: retRes }] = await Promise.all([
        axios.get(`/api/sales/invoice/${invNumber}`),
        axios.get(`/api/sales/invoice/${invNumber}/returns`)
      ]);
      setInvoiceItems(invRes.items);
      setExistingReturns(retRes);
      // init return form
      const init = {};
      invRes.items.forEach(i => {
        init[i.item_id] = { qty: 0, reason: '', restock: false };
      });
      setReturns(init);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invoice not found');
    }
  };

  // 3️⃣ When user clicks a suggestion
  const pickSuggestion = s => {
    setInvoiceNo(s.invoice_number);
    setSuggestions([]);
    loadInvoice(s.invoice_number);
  };

  // 4️⃣ Handle form input for each item
  const onReturnChange = (itemId, field, value) => {
    setReturns(r => ({
      ...r,
      [itemId]: { ...r[itemId], [field]: value }
    }));
  };

  // 5️⃣ Submit the return
  const submitReturn = async () => {
    const itemsToReturn = Object.entries(returns)
      .filter(([, v]) => v.qty > 0)
      .map(([item_id, v]) => ({
        item_id,
        quantity_returned: v.qty,
        reason: v.reason,
        restock: v.restock
      }));
    if (!itemsToReturn.length) {
      return toast.warn('Select at least one item to return');
    }
    try {
      await axios.post('/api/sales/returns', {
        invoice_number: invoiceNo,
        items: itemsToReturn
      });
      toast.success('Return processed');
      loadInvoice();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Return failed');
    }
  };

  // click outside suggestions to close it
  useEffect(() => {
    const handleClick = e => {
      if (!wrapperRef.current?.contains(e.target)) {
        setSuggestions([]);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return (
    <Container className="my-4">
      <ToastContainer />
      <div ref={wrapperRef} style={{ position: 'relative' }}>
        <Row className="mb-3">
          <Col md={4}>
            <Form.Control
              placeholder="Invoice # or Customer"
              value={invoiceNo}
              onChange={e => setInvoiceNo(e.target.value)}
            />
          </Col>
          <Col md="auto">
            <Button onClick={() => loadInvoice()}>Load</Button>
          </Col>
        </Row>

        {suggestions.length > 0 && (
          <ListGroup
            style={{
              position: 'absolute',
              top: '100%',
              width: '350px',
              zIndex: 1000
            }}
          >
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
          {existingReturns.length} prior return(s) on this invoice
        </Alert>
      )}

      <Table bordered className="mt-3">
        <thead>
          <tr>
            <th>Item</th>
            <th>Sold</th>
            <th>Return Qty</th>
            <th>Reason</th>
            <th>Restock?</th>
          </tr>
        </thead>
        <tbody>
          {invoiceItems.map(it => {
            const prevReturned = existingReturns
              .filter(r => r.item_id === it.item_id)
              .reduce((sum, r) => sum + parseFloat(r.quantity_returned), 0);
            const maxQty = parseFloat(it.quantity_sold) - prevReturned;
            const { qty, reason, restock } = returns[it.item_id] || {};
            return (
              <tr key={it.item_id}>
                <td>{it.description}</td>
                <td>
                  {it.quantity_sold} (returned {prevReturned})
                </td>
                <td>
                  <Form.Control
                    type="number"
                    min={0}
                    max={maxQty}
                    value={qty || 0}
                    onChange={e =>
                      onReturnChange(
                        it.item_id,
                        'qty',
                        parseFloat(e.target.value)
                      )
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
                <td>
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

      <Button onClick={submitReturn}>Confirm Return</Button>
    </Container>
  );
}
