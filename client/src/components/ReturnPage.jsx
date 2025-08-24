// src/pages/ReturnPage.js
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
  const [activeSuggestion, setActiveSuggestion] = useState(-1);

  const [invoiceItems, setInvoiceItems] = useState([]);
  const [existingReturns, setExistingReturns] = useState([]);
  const [returns, setReturns] = useState({});
  const [activeRow, setActiveRow] = useState(0);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmIdx, setConfirmIdx] = useState(0); // 0 = cash, 1 = withholding (or vice-versa based on checked)
  const [refundSummary, setRefundSummary] = useState(null);
  const [refundInCash, setRefundInCash] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const wrapperRef = useRef();
  const inputRef = useRef(null);
  const sugItemRefs = useRef([]);

  // Focus the search on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Suggestions (debounced)
  useEffect(() => {
    const q = invoiceNo.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setActiveSuggestion(-1);
      return;
    }
    const t = setTimeout(() => {
      axios.get('/api/sales/invoice-suggestions', { params: { q } })
        .then(r => {
          const arr = r.data || [];
          setSuggestions(arr);
          setActiveSuggestion(arr.length ? 0 : -1);
        })
        .catch(() => {
          setSuggestions([]);
          setActiveSuggestion(-1);
        });
    }, 250);
    return () => clearTimeout(t);
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
      invRes.items.forEach(i => { init[i.item_id] = { qty: 0, reason: '', restock: false }; });
      setReturns(init);
      setActiveRow(0);
      setSuggestions([]);
      setActiveSuggestion(-1);
      inputRef.current?.blur(); // arrow keys ready for table
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invoice not found');
    }
  };

  const pickSuggestion = s => {
    setInvoiceNo(s.invoice_number);
    setSuggestions([]);
    setActiveSuggestion(-1);
    loadInvoice(s.invoice_number);
  };

  // Hide suggestions when clicking outside
  const handleClickOutside = e => {
    if (!wrapperRef.current?.contains(e.target)) {
      setSuggestions([]);
      setActiveSuggestion(-1);
    }
  };
  useEffect(() => {
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Keep active suggestion visible
  useEffect(() => {
    if (activeSuggestion >= 0 && sugItemRefs.current[activeSuggestion]) {
      sugItemRefs.current[activeSuggestion].scrollIntoView({ block: 'nearest' });
    }
  }, [activeSuggestion]);

  // Keyboard on search
  const handleSearchKeyDown = (e) => {
    if (suggestions.length === 0) {
      if (e.key === 'Enter') { e.preventDefault(); loadInvoice(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggestion(i => (i + 1) % suggestions.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggestion(i => (i - 1 + suggestions.length) % suggestions.length); }
    else if (e.key === 'Enter') { e.preventDefault(); if (activeSuggestion >= 0) pickSuggestion(suggestions[activeSuggestion]); }
    else if (e.key === 'Escape') { setSuggestions([]); setActiveSuggestion(-1); }
  };

  // Helpers
  const returnedQtyFor = (itemId) =>
    existingReturns.filter(r => r.item_id === itemId)
      .reduce((sum, r) => sum + parseFloat(r.quantity_returned || 0), 0);

  const maxQtyFor = (it) => parseFloat(it.quantity_sold) - returnedQtyFor(it.item_id);

  const bumpQty = (delta) => {
    const it = invoiceItems[activeRow]; if (!it) return;
    const maxQty = maxQtyFor(it);
    setReturns(prev => {
      const cur = prev[it.item_id] || { qty: 0, reason: '', restock: false };
      let q = (cur.qty || 0) + delta;
      if (q < 0) q = 0;
      if (q > maxQty) q = maxQty;
      return { ...prev, [it.item_id]: { ...cur, qty: q } };
    });
  };

  const toggleRestock = () => {
    const it = invoiceItems[activeRow]; if (!it) return;
    setReturns(prev => {
      const cur = prev[it.item_id] || { qty: 0, reason: '', restock: false };
      return { ...prev, [it.item_id]: { ...cur, restock: !cur.restock } };
    });
  };

  const calculateRefundSummary = () => {
    let refund = 0, tax = 0;
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
    if (!hasItems) { toast.warn('Please select at least one item to return'); return; }
    // set default confirmIdx from refundInCash
    setConfirmIdx(refundInCash ? 0 : 1);
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

      if (data.fullyReturned) setShowDeleteModal(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Return failed');
    }
  };

  const summary = calculateRefundSummary();

  // GLOBAL keys for table (when no modal and not typing)
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const modalOpen = showConfirmModal || !!refundSummary || showDeleteModal;
      if (modalOpen) return;
      if (tag === 'input' || tag === 'textarea') return;
      if (!invoiceItems.length) return;

      if (e.key === 'ArrowUp') { e.preventDefault(); bumpQty(+1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); bumpQty(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); toggleRestock(); }
      else if (e.key === 'Tab') { e.preventDefault(); validateBeforeSubmit(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [invoiceItems, activeRow, showConfirmModal, refundSummary, showDeleteModal]);

  // Keyboard in Confirm Return modal
  useEffect(() => {
    if (!showConfirmModal) return;
    const onKey = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setConfirmIdx(i => (i === 0 ? 1 : 0));
        setRefundInCash(idxToCash(confirmIdx === 0 ? 1 : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        finalizeReturn();
      } else if (e.key === ' ') {
        e.preventDefault();
        setShowConfirmModal(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showConfirmModal, confirmIdx]);

  const idxToCash = (idx) => idx === 0; // 0 => cash, 1 => withholding

  // Keyboard in Return Completed modal
  useEffect(() => {
    if (!refundSummary) return;
    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); setRefundSummary(null); }
      else if (e.key === ' ') { e.preventDefault(); window.print(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [refundSummary]);

  return (
    <div className="returns-page">
      <ToastContainer />
      <Container className="card-white my-3 p-3 p-md-4 shadow-lg">
        <header className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
          <h2 className="page-title m-0">Returns</h2>
          <div className="accent-bar" />
        </header>

        <div ref={wrapperRef}>
          <Row className="mb-2 justify-content-center">
            <Col md={7}>
              <Form.Control
                ref={inputRef}
                size="lg"
                placeholder="Enter Invoice # or Customer"
                value={invoiceNo}
                onChange={e => setInvoiceNo(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="text-center input-glass"
                aria-autocomplete="list"
                aria-expanded={suggestions.length > 0}
                aria-activedescendant={
                  activeSuggestion >= 0 ? `suggestion-${activeSuggestion}` : undefined
                }
              />
            </Col>
            <Col md="auto" className="mt-2 mt-md-0">
              <Button size="lg" className="btn-accent" onClick={() => loadInvoice()}>
                Load
              </Button>
            </Col>
          </Row>

          {/* Suggestions now IN FLOW: no overlap, no big empty space */}
          {suggestions.length > 0 && (
            <ListGroup
              className="suggestions-list"
              role="listbox"
            >
              {suggestions.map((s, idx) => (
                <ListGroup.Item
                  key={s.invoice_number}
                  id={`suggestion-${idx}`}
                  role="option"
                  aria-selected={activeSuggestion === idx}
                  action
                  ref={el => (sugItemRefs.current[idx] = el)}
                  onClick={() => pickSuggestion(s)}
                  className={activeSuggestion === idx ? 'active-suggestion' : ''}
                  style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}
                >
                  <strong style={{ minWidth: 110 }}>{s.invoice_number}</strong>
                  <span className="text-muted">{s.customer_name}</span>
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}
        </div>

        {existingReturns.length > 0 && (
          <Alert variant="info" className="mt-2 mb-2">
            {existingReturns.length} return(s) have already been recorded for this invoice.
          </Alert>
        )}

        {invoiceItems.length > 0 && (
          <>
            <div className="kbd-hint mb-1">
              ↑ increase qty, ↓ decrease qty, Enter toggle Restock, Tab proceed
            </div>

            <Table bordered responsive className="mt-1 table-tight">
              <thead>
                <tr>
                  <th style={{ width: 24 }}></th>
                  <th>Description</th>
                  <th>Sold</th>
                  <th style={{ width: 140 }}>Return Qty</th>
                  <th>Reason</th>
                  <th className="text-center" style={{ width: 110 }}>Restock?</th>
                </tr>
              </thead>
              <tbody>
                {invoiceItems.map((it, idx) => {
                  const returnedQty = returnedQtyFor(it.item_id);
                  const maxQty = maxQtyFor(it);
                  const { qty, reason, restock } = returns[it.item_id] || {};
                  const isActive = idx === activeRow;
                  return (
                    <tr
                      key={it.item_id}
                      className={isActive ? 'row-active' : ''}
                      onMouseEnter={() => setActiveRow(idx)}
                    >
                      <td className="text-center">{isActive ? '➤' : ''}</td>
                      <td>{it.description}</td>
                      <td>{it.quantity_sold} (returned {returnedQty})</td>
                      <td>
                        <Form.Control
                          type="number"
                          min={0}
                          max={maxQty}
                          value={qty || 0}
                          onChange={e =>
                            setReturns(r => ({
                              ...r,
                              [it.item_id]: {
                                ...(r[it.item_id] || { reason: '', restock: false }),
                                qty: parseFloat(e.target.value || 0)
                              }
                            }))
                          }
                          onFocus={() => setActiveRow(idx)}
                        />
                      </td>
                      <td>
                        <Form.Control
                          value={reason || ''}
                          onChange={e =>
                            setReturns(r => ({
                              ...r,
                              [it.item_id]: {
                                ...(r[it.item_id] || { qty: 0, restock: false }),
                                reason: e.target.value
                              }
                            }))
                          }
                          onFocus={() => setActiveRow(idx)}
                        />
                      </td>
                      <td className="text-center">
                        <Form.Check
                          type="checkbox"
                          checked={restock || false}
                          onChange={e =>
                            setReturns(r => ({
                              ...r,
                              [it.item_id]: {
                                ...(r[it.item_id] || { qty: 0, reason: '' }),
                                restock: e.target.checked
                              }
                            }))
                          }
                          onFocus={() => setActiveRow(idx)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>

            <div className="text-end totals mt-2">
              <p><strong>Refund:</strong> Rs. {summary.refund.toFixed(2)}</p>
              <p><strong>Tax Reversal:</strong> Rs. {summary.tax.toFixed(2)}</p>
              <h5 className="text-success m-0">Total: Rs. {summary.total.toFixed(2)}</h5>
            </div>

            <div className="d-flex justify-content-end mt-3">
              <Button className="btn-accent" onClick={validateBeforeSubmit}>
                Proceed to Return
              </Button>
            </div>
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
              checked={confirmIdx === 0}
              onChange={() => { setConfirmIdx(0); setRefundInCash(true); }}
            />
            <Form.Check
              type="radio"
              label="Add refund amount to customer credit / withholding"
              name="refundOption"
              checked={confirmIdx === 1}
              onChange={() => { setConfirmIdx(1); setRefundInCash(false); }}
              className="mt-2"
            />
            <div className="mt-2 small text-muted">Use ↑/↓ to select, Enter to confirm, Space to cancel.</div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowConfirmModal(false)}>Cancel</Button>
            <Button className="btn-accent" onClick={finalizeReturn}>Confirm Return</Button>
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
            <p>Method: <strong>{refundSummary?.refundInCash ? 'Cash Given' : 'Withholding / Credit'}</strong></p>
            <div className="mt-2 small text-muted">Press Enter to Done, Space to Print.</div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => window.print()}>
              🖨️ Print Receipt
            </Button>
            <Button className="btn-accent" onClick={() => setRefundSummary(null)}>
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

      {/* Styles */}
      <style>{`
        .returns-page {
          min-height: 100vh;
          background: #0d0d0d;
          color: #eaeaea;
        }
        .card-white {
          background: #fff; color: #222;
          border-radius: 16px;
          border: 1px solid rgba(255,76,76,0.22);
        }
        .page-title {
          font-weight: 800; letter-spacing: .5px; color:rgb(117, 42, 42); text-transform: uppercase;
          text-shadow: 0 1px 6px rgba(255,76,76,0.35);
        }
        .accent-bar {
          height: 6px; flex: 1 1 140px; border-radius: 999px;
          background: linear-gradient(90deg, rgba(166, 74, 74, 0.85), rgba(255,76,76,.2));
        }
        .input-glass {
          border-radius: 12px;
          border: 1px solid rgba(255,76,76,0.35);
        }
        .input-glass:focus { box-shadow: 0 0 0 .25rem rgba(255,76,76,.2); border-color:rgb(136, 41, 41); }
        .btn-accent { background:#ff4c4c; border-color:#ff4c4c; color:#fff; font-weight:700; border-radius:12px; }
        .btn-accent:hover { background:#ff3a3a; border-color:#ff3a3a; }

        /* Suggestions list in-flow (no overlap, tight) */
        .suggestions-list {
          margin-top: .35rem;
          border: 1px solid rgba(0,0,0,0.08);
          border-radius: 12px;
          max-height: 260px;
          overflow: auto;
          box-shadow: 0 8px 18px rgba(0,0,0,.12);
        }
        .active-suggestion { background: rgba(185, 121, 121, 0.6) !important; color:#111; }

        .table-tight td, .table-tight th { vertical-align: middle; }
        .row-active { background: rgba(255,76,76,0.06); }
        .kbd-hint { font-size: .85rem; color: #666; }

        /* Tighten vertical rhythm */
        .mt-1 { margin-top: .25rem !important; }
        .mt-2 { margin-top: .5rem !important; }
        .mb-1 { margin-bottom: .25rem !important; }
        .mb-2 { margin-bottom: .5rem !important; }
      `}</style>
    </div>
  );
}
