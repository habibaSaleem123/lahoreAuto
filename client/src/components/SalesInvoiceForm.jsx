/* FULL FILE — SalesInvoiceForm.jsx (keyboard-first, visually improved) */
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { Modal, Toast, ToastContainer } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import {
  FaUserTag, FaSearch, FaShoppingBasket, FaLayerGroup,
  FaCashRegister, FaPlus, FaTrash, FaChevronDown, FaTimes
} from 'react-icons/fa';
import AddCustomerForm from './AddCustomerForm';

const ENTER_DOUBLE_MS = 350;
const LOW_STOCK_THRESHOLD = 40;

const SalesInvoiceForm = () => {
  const navigate = useNavigate();

  // Master data
  const [customers, setCustomers] = useState([]);
  const [items, setItems] = useState([]);

  // Customer state
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedCustomerData, setSelectedCustomerData] = useState(null);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');

  // Item search / pick
  const [itemQuery, setItemQuery] = useState('');
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  // GD / batches
  const [gdOptions, setGdOptions] = useState([]);
  const [showGdPicker, setShowGdPicker] = useState(false);
  const [itemForGd, setItemForGd] = useState(null);

  // Lines
  const [formItems, setFormItems] = useState([]);
  const [activeLineIndex, setActiveLineIndex] = useState(-1); // keyboard focus within table

  // Taxes
  const [taxSection, setTaxSection] = useState('236H');
  // Show to user as percent (1 = 1%), convert to fraction when posting
  const [withholdingRate, setWithholdingRate] = useState(1);

  // UI
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Flow / focus
  const [focusSection, setFocusSection] = useState('customer'); // 'customer' | 'search' | 'gd' | 'lines' | 'confirm'
  const lastEnterRef = useRef(0);
  const searchInputRef = useRef(null);
  const customerFilterRef = useRef(null);
  const itemFilterRef = useRef(null);
  const tableWrapRef = useRef(null); // NEW: to focus selected items table region

  // Refs for scrolling active options into view
  const itemPickerRowRefs = useRef([]);
  const gdPickerRowRefs = useRef([]);
  const quickResultRowRefs = useRef([]);

  // Refs for line inputs to enable keyboard grid nav
  const qtyRefs = useRef([]);
  const rateRefs = useRef([]);
  const lineRowRefs = useRef([]);

  const clampIndex = useCallback((idx, list) => {
    if (!list.length) return 0;
    return Math.max(0, Math.min(idx, list.length - 1));
  }, []);

  const isDoubleEnter = () => {
    const now = Date.now();
    const isDouble = now - lastEnterRef.current < ENTER_DOUBLE_MS;
    lastEnterRef.current = now;
    return isDouble;
  };

  const ensureRowVisible = (arrRefs, idx) => {
    const el = arrRefs.current?.[idx];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  };

  // Load customers
  useEffect(() => {
    axios.get('/api/customers')
      .then(res => setCustomers(res.data || []))
      .catch(err => {
        setToastMessage("⚠️ Failed to fetch customers: " + (err?.message || "Unknown error"));
        setShowToast(true);
      });
  }, []);

  // Live item search (debounced)
  useEffect(() => {
    const q = (itemQuery || '').trim();
    const t = setTimeout(() => {
      axios.get(`/api/items/search?query=${encodeURIComponent(q)}`)
        .then(res => setItems(res.data || []))
        .catch(err => {
          setItems([]);
          setToastMessage("⚠️ Failed to fetch items: " + (err?.message || "Unknown error"));
          setShowToast(true);
        });
    }, 180);
    return () => clearTimeout(t);
  }, [itemQuery]);

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.toLowerCase();
    return customers.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.business_name?.toLowerCase().includes(q)
    );
  }, [customers, customerQuery]);

  const filteredItems = useMemo(() => {
    const q = itemQuery.toLowerCase();
    return items.filter(i =>
      i.description?.toLowerCase().includes(q) ||
      i.hs_code?.toString().includes(q)
    );
  }, [items, itemQuery]);

  function getActiveList() {
    if (showCustomerPicker) return filteredCustomers;
    if (showItemPicker) return filteredItems;
    if (showGdPicker) return gdOptions;
    return [];
  }

  // Actions
  const selectCustomer = (c) => {
    setSelectedCustomer(c.id);
    setSelectedCustomerData(c);
    setWithholdingRate(c.filer_status === 'filer' ? 0.5 : 1); // percent
    setShowCustomerPicker(false);
    setFocusSection('search');
    // Immediately open the item browser to make the flow explicit
    setShowItemPicker(true);
    setHighlightIndex(0);
    setTimeout(() => itemFilterRef.current?.focus(), 0);
  };

  const openGdPicker = async (item) => {
    setItemForGd(item);
    setFocusSection('gd');
    setHighlightIndex(0);
    try {
      // Expect: [{ gd_id, gd_number, quantity_remaining, cost, mrp }]
      const res = await axios.get(`/api/items/${item.item_id}/availability`);
      const opts = (res.data || []).filter(g => g.quantity_remaining > 0);
      setGdOptions(opts);
    } catch (err) {
      setToastMessage("⚠️ Failed to fetch stock batches: " + (err?.message || "Unknown error"));
      setShowToast(true);
      setGdOptions([]);
    } finally {
      setShowGdPicker(true);
      setTimeout(() => ensureRowVisible(gdPickerRowRefs, 0), 0);
    }
  };

  const addLineFromGd = (gd) => {
    if (!itemForGd) return;
    const exists = formItems.find(l => l.item_id === itemForGd.item_id && l.gd_id === gd.gd_id);
    if (exists) {
      setShowGdPicker(false);
      setFocusSection('search');
      searchInputRef.current?.focus();
      return;
    }
    const saleRate = itemForGd.sale_price ?? itemForGd.retail_price ?? 0;
    setFormItems(prev => {
      const next = [
        ...prev,
        {
          item_id: itemForGd.item_id,
          description: itemForGd.description,
          hs_code: itemForGd.hs_code,
          unit: itemForGd.unit,
          retail_price: Number(itemForGd.retail_price || 0),
          sale_rate: Number(saleRate),
          quantity: 0,
          gd_id: gd.gd_id,
          gd_number: gd.gd_number,
          max_qty: Number(gd.quantity_remaining || 0),
          cost: gd.cost ?? null,
          mrp: gd.mrp ?? null,
        },
      ];
      // set active row to newly added for keyboard editing
      setTimeout(() => {
        setActiveLineIndex(next.length - 1);
        setFocusSection('lines');
        lineRowRefs.current[next.length - 1]?.focus();
      }, 0);
      return next;
    });
    setShowGdPicker(false); setItemForGd(null);
    setFocusSection('search');
    searchInputRef.current?.focus();
  };

  const handleQtyChange = (idx, value) => {
    setFormItems(prev => {
      const next = [...prev];
      const max = Number(next[idx].max_qty || 0);
      let qty = Number(value || 0);
      if (qty < 0) qty = 0;
      if (qty > max) qty = max;
      next[idx].quantity = qty;
      return next;
    });
  };

  const adjustQty = (idx, delta) => {
    setFormItems(prev => {
      const next = [...prev];
      const max = Number(next[idx].max_qty || 0);
      let qty = Number(next[idx].quantity || 0) + delta;
      if (qty < 0) qty = 0;
      if (qty > max) qty = max;
      next[idx].quantity = qty;
      return next;
    });
  };

  const handleRateChange = (idx, value) => {
    setFormItems(prev => {
      const next = [...prev];
      let rate = Number(value || 0);
      const cap = Number(next[idx].retail_price || Infinity);
      if (rate > cap) {
        rate = cap;
        setToastMessage("ℹ️ Rate capped at retail price.");
        setShowToast(true);
      }
      next[idx].sale_rate = rate;
      return next;
    });
  };

  const removeLine = (idx) =>
    setFormItems(prev => {
      const next = prev.filter((_, i) => i !== idx);
      // fix active index
      let newActive = -1;
      if (next.length) newActive = Math.min(idx, next.length - 1);
      setActiveLineIndex(newActive);
      return next;
    });

  const calculateLineTotal = (item) => Number(item.quantity || 0) * Number(item.sale_rate || 0);
  const grossTotal = formItems.reduce((s, it) => s + calculateLineTotal(it), 0);
  const salesTax   = formItems.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.sale_rate || 0) * 0.18, 0);
  const withholdingTax = grossTotal * (Number(withholdingRate || 0) / 100);

  const handleSubmit = async () => {
    const payload = {
      customer_id: selectedCustomer,
      items: formItems
        .filter(i => Number(i.quantity) > 0)
        .map(l => ({
          item_id: l.item_id,
          gd_entry_id: l.gd_id,          // line-level GD
          quantity: Number(l.quantity),
          sale_rate: Number(l.sale_rate),
          retail_price: Number(l.retail_price),
          unit: l.unit,
        })),
      withholding_rate: Number(withholdingRate || 0) / 100,
      tax_section: taxSection,
    };

    try {
      const res = await axios.post('/api/sales/create-invoice', payload);
      navigate(`/invoice/${res.data.invoice_number}`);
    } catch (err) {
      setToastMessage('❌ Error creating invoice: ' + (err.response?.data?.error || err.message));
      setShowToast(true);
    }
  };

  // Global keyboard — but do NOT hijack when typing in inputs/textarea/contentEditable
  useEffect(() => {
    function onKeyDown(e) {
      const tag = (e.target?.tagName || '').toLowerCase();
      const isTyping =
        tag === 'input' ||
        tag === 'textarea' ||
        e.target.isContentEditable ||
        e.target.getAttribute?.('role') === 'spinbutton';
      if (isTyping) return;

      const inModal = showCustomerPicker || showItemPicker || showGdPicker || showConfirmModal;

      // list navigation for modals
      if (inModal && ['ArrowDown', 'ArrowUp'].includes(e.key)) {
        const list = getActiveList();
        if (!list.length) return;
        setHighlightIndex(i => {
          const next = clampIndex(i + (e.key === 'ArrowDown' ? 1 : -1), list);
          if (showItemPicker) ensureRowVisible(itemPickerRowRefs, next);
          if (showGdPicker) ensureRowVisible(gdPickerRowRefs, next);
          return next;
        });
        e.preventDefault();
        return;
      }

      // NEW: simple Enter/Esc behavior in confirm modal
      if (showConfirmModal) {
        if (e.key === 'Enter') { handleSubmit(); e.preventDefault(); return; }
        if (e.key === 'Escape') { setShowConfirmModal(false); e.preventDefault(); return; }
      }

      if (e.key === 'Escape') {
        if (showGdPicker) { setShowGdPicker(false); setFocusSection('search'); }
        else if (showItemPicker) setShowItemPicker(false);
        else if (showCustomerPicker) setShowCustomerPicker(false);
        else if (showConfirmModal) setShowConfirmModal(false);
        e.preventDefault();
        return;
      }

      // Keep double-enter for browsing lists elsewhere
      if (e.key !== 'Enter' && !(focusSection === 'search' && e.code === 'Space')) return;

      const dbl = e.key === 'Enter' ? isDoubleEnter() : false;

      if (focusSection === 'customer') {
        if (dbl) {
          setShowCustomerPicker(true); setHighlightIndex(0);
          setTimeout(() => customerFilterRef.current?.focus(), 0);
        } else if (e.key === 'Enter' && selectedCustomer) {
          // explicit: after selecting, we already opened Product Browser.
          setFocusSection('search');
          if (!showItemPicker) {
            setShowItemPicker(true);
            setTimeout(() => itemFilterRef.current?.focus(), 0);
          }
        }
        e.preventDefault();
        return;
      }

      if (focusSection === 'search') {
        // NEW: Space jumps to Selected Items (if any)
        if (e.code === 'Space' && formItems.length > 0) {
          setFocusSection('lines');
          setActiveLineIndex(prev => (prev === -1 ? 0 : prev));
          setTimeout(() => tableWrapRef.current?.focus(), 0);
          e.preventDefault();
          return;
        }

        const list = filteredItems;
        if (dbl) {
          setShowItemPicker(true); setHighlightIndex(0);
          setTimeout(() => itemFilterRef.current?.focus(), 0);
          e.preventDefault();
          return;
        }
        if (list.length > 0 && e.key === 'Enter') {
          const item = list[clampIndex(highlightIndex, list)];
          openGdPicker(item);
          e.preventDefault();
          return;
        }
        if (e.key === 'Enter' && formItems.length > 0) {
          // If nothing picked and Enter pressed, ask to confirm (as before)
          setShowConfirmModal(true);
          setFocusSection('confirm');
          e.preventDefault();
          return;
        }
      }

      if (focusSection === 'gd' && showGdPicker && e.key === 'Enter') {
        const list = gdOptions;
        if (list.length > 0) {
          const opt = list[clampIndex(highlightIndex, list)];
          addLineFromGd(opt);
        }
        e.preventDefault();
        return;
      }

      if (focusSection === 'lines') {
        // NEW: Enter opens confirm modal (then Enter = confirm, Esc = cancel)
        if (e.key === 'Enter') {
          setShowConfirmModal(true);
          setFocusSection('confirm');
          e.preventDefault();
          return;
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    focusSection, filteredItems, gdOptions, selectedCustomer, highlightIndex,
    showCustomerPicker, showItemPicker, showGdPicker, showConfirmModal, clampIndex, formItems.length
  ]);

  // Keyboard nav within quick results (outside modal)
  const handleSearchKeyNav = (e) => {
    const list = filteredItems;
    if (!list.length) {
      // allow Space to jump even if no quick results
      if (e.code === 'Space' && formItems.length > 0) {
        setFocusSection('lines');
        setActiveLineIndex(prev => (prev === -1 ? 0 : prev));
        setTimeout(() => tableWrapRef.current?.focus(), 0);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      setHighlightIndex(i => {
        const next = clampIndex(i + (e.key === 'ArrowDown' ? 1 : -1), list);
        ensureRowVisible(quickResultRowRefs, next);
        return next;
      });
      e.preventDefault();
    } else if (e.key === 'Enter') {
      const item = list[clampIndex(highlightIndex, list)];
      if (item) {
        openGdPicker(item);
        e.preventDefault();
      }
    } else if (e.code === 'Space') {
      if (formItems.length > 0) {
        setFocusSection('lines');
        setActiveLineIndex(prev => (prev === -1 ? 0 : prev));
        setTimeout(() => tableWrapRef.current?.focus(), 0);
        e.preventDefault();
      }
    }
  };

  // Keyboard nav inside the line items table
  const onLinesKeyDown = (e) => {
    if (!formItems.length) return;
    if (activeLineIndex === -1) setActiveLineIndex(0);

    const last = formItems.length - 1;

    // navigation between rows
    if (e.key === 'ArrowDown') {
      const next = Math.min(activeLineIndex + 1, last);
      setActiveLineIndex(next);
      lineRowRefs.current[next]?.focus();
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowUp') {
      const prev = Math.max(activeLineIndex - 1, 0);
      setActiveLineIndex(prev);
      lineRowRefs.current[prev]?.focus();
      e.preventDefault();
      return;
    }

    // switch between qty and rate
    if (e.key === 'ArrowLeft') {
      qtyRefs.current[activeLineIndex]?.focus();
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowRight') {
      rateRefs.current[activeLineIndex]?.focus();
      e.preventDefault();
      return;
    }

    // quick shortcuts
    if (e.key === 'q' || e.key === 'Q') {
      qtyRefs.current[activeLineIndex]?.focus();
      e.preventDefault();
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      rateRefs.current[activeLineIndex]?.focus();
      e.preventDefault();
      return;
    }

    // quantity adjust
    if (e.key === '+' || e.key === '=') { adjustQty(activeLineIndex, 1); e.preventDefault(); return; }
    if (e.key === '-') { adjustQty(activeLineIndex, -1); e.preventDefault(); return; }
    if (e.key === 'PageUp') { adjustQty(activeLineIndex, 5); e.preventDefault(); return; }
    if (e.key === 'PageDown') { adjustQty(activeLineIndex, -5); e.preventDefault(); return; }

    // delete line
    if (e.key === 'Delete' || e.key === 'Backspace') {
      removeLine(activeLineIndex);
      e.preventDefault();
      return;
    }
  };

  // Small UI helpers
  const CustomerBadge = () =>
    selectedCustomerData ? (
      <div className="chip"><FaUserTag /> {selectedCustomerData.name} <span className="muted">({selectedCustomerData.business_name})</span></div>
    ) : (
      <div className="chip ghost"><FaUserTag /> Select customer</div>
    );

  const ItemRow = ({ item, active, idx, inQuickResults }) => {
    const lowStock = Number(item.available_total || 0) < LOW_STOCK_THRESHOLD;
    const setRef = (el) => {
      if (inQuickResults) quickResultRowRefs.current[idx] = el;
      else itemPickerRowRefs.current[idx] = el;
    };
    return (
      <div
        ref={setRef}
        className={`picker-row ${active ? 'active' : ''}`}
        onClick={() => openGdPicker(item)}
        role="option"
        aria-selected={active}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') openGdPicker(item); }}
      >
        <div className="primary">{item.description}</div>
        <div className="meta">
          <span>HS {item.hs_code}</span>
          <span>{item.unit}</span>
          <span>MRP Rs {Number(item.retail_price || 0).toFixed(2)}</span>
        </div>
        <div className={`right ${lowStock ? 'warn' : ''}`}>
          {lowStock ? `Low: ${item.available_total}` : `In stock: ${item.available_total}`}
        </div>
      </div>
    );
  };

  return (
    <div className="sales-page">
      <header className="header">
        <div className="title-wrap">
          <FaCashRegister className="title-icon" aria-hidden />
          <h2 className="title">Create Sales Invoice</h2>
        </div>

        <div className="controls" aria-label="Invoice controls">
          <div className="select-wrap">
            <label htmlFor="taxSection">Tax Section</label>
            <div className="select">
              <select id="taxSection" value={taxSection} onChange={(e) => setTaxSection(e.target.value)} aria-label="Tax section">
                <option value="236G">236G (Distributor)</option>
                <option value="236H">236H (Retailer)</option>
              </select>
              <FaChevronDown aria-hidden />
            </div>
          </div>

          <div className="select-wrap">
            <label htmlFor="wht">Withholding (%)</label>
            <input
              id="wht"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={withholdingRate}
              onChange={(e) => setWithholdingRate(parseFloat(e.target.value || 0))}
              aria-label="Withholding percentage"
            />
          </div>

          <button
            className="btn ghost"
            onClick={() => setShowCustomerModal(true)}
            aria-label="Add customer"
          >
            <FaPlus aria-hidden /> Add Customer
          </button>
        </div>
      </header>

      {/* Customer */}
      <section className="card" aria-labelledby="customer-section">
        <div className="section-head">
          <h3 id="customer-section"><FaUserTag aria-hidden /> Customer</h3>
          <small>Enter = next • Double-Enter = Browse</small>
        </div>

        <div className="row-g">
          <CustomerBadge />
          <div className="search-wrap">
            <FaSearch className="search-icon" aria-hidden />
            <input
              placeholder="Type to filter customers (double-Enter opens list)…"
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              onFocus={() => setFocusSection('customer')}
              aria-label="Filter customers"
            />
            <button
              className="btn"
              onClick={() => {
                setShowCustomerPicker(true);
                setHighlightIndex(0);
                setTimeout(() => customerFilterRef.current?.focus(), 0);
              }}
              aria-haspopup="dialog"
              aria-controls="customer-picker"
              aria-expanded={showCustomerPicker}
            >
              Browse
            </button>
          </div>
        </div>
      </section>

      {/* Products */}
      <section className="card" aria-labelledby="products-section">
        <div className="section-head">
          <h3 id="products-section"><FaShoppingBasket aria-hidden /> Products</h3>
          <small>Enter = pick highlighted • Double-Enter = Browse • ↑/↓ navigate • <b>Space = Selected Items</b></small>
        </div>

        <div className="search-wrap">
          <FaSearch className="search-icon" aria-hidden />
          <input
            ref={searchInputRef}
            placeholder="Search parts by description or HS code"
            value={itemQuery}
            onChange={(e) => { setItemQuery(e.target.value); setHighlightIndex(0); }}
            onFocus={() => setFocusSection('search')}
            onKeyDown={handleSearchKeyNav}
            disabled={!selectedCustomer}
            aria-label="Search products"
          />
          <button
            className="btn"
            disabled={!selectedCustomer}
            onClick={() => { setShowItemPicker(true); setHighlightIndex(0); setTimeout(()=>itemFilterRef.current?.focus(),0); }}
            aria-haspopup="dialog"
            aria-controls="item-picker"
            aria-expanded={showItemPicker}
          >
            Browse
          </button>
        </div>

        {!!filteredItems.length && selectedCustomer && (
          <div
            className="quick-results"
            role="listbox"
            aria-label="Quick results"
            aria-activedescendant={`qr-opt-${clampIndex(highlightIndex, filteredItems)}`}
          >
            {filteredItems.slice(0, 8).map((item, i) => (
              <div
                key={item.item_id}
                id={`qr-opt-${i}`}
                ref={(el) => (quickResultRowRefs.current[i] = el)}
                className={`picker-row ${i === clampIndex(highlightIndex, filteredItems) ? 'active' : ''}`}
                role="option"
                aria-selected={i === clampIndex(highlightIndex, filteredItems)}
                tabIndex={0}
                onMouseEnter={() => setHighlightIndex(i)}
                onClick={() => openGdPicker(item)}
                onKeyDown={(e)=>{ if(e.key==='Enter'){openGdPicker(item);} }}
              >
                <div className="primary">{item.description}</div>
                <div className="meta">
                  <span>HS {item.hs_code}</span>
                  <span>{item.unit}</span>
                  <span>MRP Rs {Number(item.retail_price || 0).toFixed(2)}</span>
                </div>
                <div className={`right ${Number(item.available_total||0)<LOW_STOCK_THRESHOLD?'warn':''}`}>
                  {Number(item.available_total||0)<LOW_STOCK_THRESHOLD ? `Low: ${item.available_total}` : `In stock: ${item.available_total}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Lines */}
      {formItems.length > 0 && (
        <section className="card" aria-labelledby="lines-section">
          <div className="section-head"><h3 id="lines-section"><FaLayerGroup aria-hidden /> Line Items</h3></div>

          <div
            className="table-wrap"
            role="region"
            aria-label="Line items table"
            tabIndex={0}
            ref={tableWrapRef}
            onFocus={() => { if (activeLineIndex === -1) setActiveLineIndex(0); setFocusSection('lines'); }}
            onKeyDown={onLinesKeyDown}
          >
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Description</th>
                  <th scope="col">HS Code</th>
                  <th scope="col">Unit</th>
                  <th scope="col">Retail</th>
                  <th scope="col">GD</th>
                  <th scope="col">Avail</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Rate</th>
                  <th scope="col">Line Total</th>
                  <th scope="col" aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {formItems.map((l, idx) => {
                  const low = Number(l.max_qty || 0) < LOW_STOCK_THRESHOLD;
                  return (
                    <tr
                      key={`${l.item_id}-${l.gd_id}`}
                      ref={(el)=> (lineRowRefs.current[idx]=el)}
                      className={`${low ? 'low-stock' : ''} ${idx===activeLineIndex?'row-active':''}`}
                      tabIndex={-1}
                      onClick={() => { setActiveLineIndex(idx); setFocusSection('lines'); }}
                    >
                      <td>
                        <div className="td-primary">{l.description}</div>
                        <div className="td-sub">Item #{l.item_id}</div>
                      </td>
                      <td>{l.hs_code}</td>
                      <td>{l.unit}</td>
                      <td>Rs {Number(l.retail_price).toFixed(2)}</td>
                      <td className="mono">{l.gd_number}</td>
                      <td className={low ? 'warn' : ''}>{l.max_qty}</td>
                      <td>
                        <label className="sr-only" htmlFor={`qty-${idx}`}>Quantity</label>
                        <input
                          id={`qty-${idx}`}
                          ref={(el)=> (qtyRefs.current[idx]=el)}
                          type="number"
                          min={0}
                          max={l.max_qty}
                          value={l.quantity}
                          onFocus={() => { setActiveLineIndex(idx); setFocusSection('lines'); }}
                          onChange={(e) => handleQtyChange(idx, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowUp') { adjustQty(idx, 1); e.preventDefault(); }
                            if (e.key === 'ArrowDown') { adjustQty(idx, -1); e.preventDefault(); }
                            if (e.key === 'PageUp') { adjustQty(idx, 5); e.preventDefault(); }
                            if (e.key === 'PageDown') { adjustQty(idx, -5); e.preventDefault(); }
                          }}
                        />
                      </td>
                      <td>
                        <label className="sr-only" htmlFor={`rate-${idx}`}>Rate</label>
                        <input
                          id={`rate-${idx}`}
                          ref={(el)=> (rateRefs.current[idx]=el)}
                          type="number"
                          step="0.01"
                          max={l.retail_price}
                          value={l.sale_rate}
                          onFocus={() => { setActiveLineIndex(idx); setFocusSection('lines'); }}
                          onChange={(e) => handleRateChange(idx, e.target.value)}
                        />
                      </td>
                      <td>Rs {calculateLineTotal(l).toFixed(2)}</td>
                      <td>
                        <button className="icon danger" onClick={() => removeLine(idx)} aria-label={`Remove ${l.description}`}>
                          <FaTrash aria-hidden />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="totals" aria-live="polite">
            <div><b>Gross:</b> Rs {grossTotal.toFixed(2)}</div>
            <div><b>Sales Tax (18%):</b> Rs {salesTax.toFixed(2)}</div>
            <div><b>Withholding:</b> Rs {withholdingTax.toFixed(2)}</div>
          </div>

          <div className="actions">
            <button
              className="btn primary"
              onClick={() => setShowConfirmModal(true)}
              disabled={!selectedCustomer || formItems.every(i => Number(i.quantity) <= 0)}
            >
              🧾 Create Invoice
            </button>
          </div>
        </section>
      )}

      {/* Customer Picker */}
      <Modal
        show={showCustomerPicker}
        onHide={() => setShowCustomerPicker(false)}
        size="lg"
        centered
        aria-labelledby="customer-picker"
        restoreFocus
      >
        <div className="modal-header dark">
          <h5 id="customer-picker" className="m-0"><FaUserTag aria-hidden /> Select Customer</h5>
          <button className="icon" onClick={() => setShowCustomerPicker(false)} aria-label="Close"><FaTimes aria-hidden /></button>
        </div>
        <div className="modal-body dark">
          <div className="search-wrap">
            <FaSearch className="search-icon" aria-hidden />
            <input
              ref={customerFilterRef}
              placeholder="Type to filter customers…"
              value={customerQuery}
              onChange={(e) => { setCustomerQuery(e.target.value); setHighlightIndex(0); }}
              onKeyDown={(e) => {
                const list = filteredCustomers;
                if (!list.length) return;
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  setHighlightIndex(i => clampIndex(i + (e.key==='ArrowDown'?1:-1), list));
                  e.preventDefault();
                } else if (e.key === 'Enter') {
                  const c = list[clampIndex(highlightIndex, list)];
                  if (c) selectCustomer(c);
                  e.preventDefault();
                }
              }}
              aria-label="Filter customers"
            />
          </div>

          <div className="picker-list" role="listbox" aria-label="Customers"
               aria-activedescendant={`cust-opt-${clampIndex(highlightIndex, filteredCustomers)}`}>
            {filteredCustomers.map((c, i) => (
              <div
                id={`cust-opt-${i}`}
                key={c.id}
                className={`picker-row ${i === highlightIndex ? 'active' : ''}`}
                onMouseEnter={() => setHighlightIndex(i)}
                onClick={() => selectCustomer(c)}
                role="option"
                aria-selected={i === highlightIndex}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') selectCustomer(c); }}
              >
                <div className="primary">{c.name}</div>
                <div className="meta">
                  <span>{c.business_name}</span>
                  <span className="pill">{c.filer_status === 'filer' ? 'Filer 0.5%' : 'Non-Filer 1%'}</span>
                </div>
              </div>
            ))}
            {!filteredCustomers.length && <div className="empty">No customers found.</div>}
          </div>
        </div>
      </Modal>

      {/* Item Picker */}
      <Modal
        show={showItemPicker}
        onHide={() => setShowItemPicker(false)}
        size="lg"
        centered
        aria-labelledby="item-picker"
        restoreFocus
      >
        <div className="modal-header dark">
          <h5 id="item-picker" className="m-0"><FaShoppingBasket aria-hidden /> Select Product</h5>
          <button className="icon" onClick={() => setShowItemPicker(false)} aria-label="Close"><FaTimes aria-hidden /></button>
        </div>
        <div className="modal-body dark">
          <div className="search-wrap">
            <FaSearch className="search-icon" aria-hidden />
            <input
              ref={itemFilterRef}
              placeholder="Search parts…"
              value={itemQuery}
              onChange={(e) => { setItemQuery(e.target.value); setHighlightIndex(0); }}
              onKeyDown={(e) => {
                const list = filteredItems;
                if (!list.length) return;
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  setHighlightIndex(i => {
                    const next = clampIndex(i + (e.key==='ArrowDown'?1:-1), list);
                    ensureRowVisible(itemPickerRowRefs, next);
                    return next;
                  });
                  e.preventDefault();
                } else if (e.key === 'Enter') {
                  const it = list[clampIndex(highlightIndex, list)];
                  if (it) { setShowItemPicker(false); openGdPicker(it); }
                  e.preventDefault();
                }
              }}
              aria-label="Filter products"
            />
          </div>

          <div className="picker-list" role="listbox" aria-label="Products"
               aria-activedescendant={`item-opt-${clampIndex(highlightIndex, filteredItems)}`}>
            {filteredItems.map((it, i) => {
              const low = Number(it.available_total || 0) < LOW_STOCK_THRESHOLD;
              const active = i === highlightIndex;
              return (
                <div
                  id={`item-opt-${i}`}
                  key={it.item_id}
                  ref={(el)=> (itemPickerRowRefs.current[i]=el)}
                  className={`picker-row ${active ? 'active' : ''}`}
                  onMouseEnter={() => setHighlightIndex(i)}
                  onClick={() => { setShowItemPicker(false); openGdPicker(it); }}
                  role="option"
                  aria-selected={active}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') { setShowItemPicker(false); openGdPicker(it); } }}
                >
                  <div className="primary">{it.description}</div>
                  <div className="meta">
                    <span>HS {it.hs_code}</span>
                    <span>{it.unit}</span>
                    <span>MRP Rs {Number(it.retail_price || 0).toFixed(2)}</span>
                  </div>
                  <div className={`right ${low ? 'warn' : ''}`}>
                    {low ? `Low: ${it.available_total}` : `In stock: ${it.available_total}`}
                  </div>
                </div>
              );
            })}
            {!filteredItems.length && <div className="empty">No items found.</div>}
          </div>
        </div>
      </Modal>

      {/* GD Picker */}
      <Modal
        show={showGdPicker}
        onHide={() => { setShowGdPicker(false); setFocusSection('search'); }}
        size="lg"
        centered
        aria-labelledby="gd-picker"
        restoreFocus
      >
        <div className="modal-header dark">
          <h5 id="gd-picker" className="m-0"><FaLayerGroup aria-hidden /> Select GD Batch</h5>
          <button className="icon" onClick={() => { setShowGdPicker(false); setFocusSection('search'); }} aria-label="Close"><FaTimes aria-hidden /></button>
        </div>
        <div className="modal-body dark">
          <div className="picker-list" role="listbox" aria-label="GD batches"
               aria-activedescendant={`gd-opt-${clampIndex(highlightIndex, gdOptions)}`}>
            {gdOptions.map((g, i) => {
              const low = Number(g.quantity_remaining || 0) < LOW_STOCK_THRESHOLD;
              const active = i === highlightIndex;
              return (
                <div
                  id={`gd-opt-${i}`}
                  key={g.gd_id}
                  ref={(el)=> (gdPickerRowRefs.current[i]=el)}
                  className={`picker-row ${active ? 'active' : ''}`}
                  onMouseEnter={() => setHighlightIndex(i)}
                  onClick={() => addLineFromGd(g)}
                  role="option"
                  aria-selected={active}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') addLineFromGd(g); }}
                >
                  <div className="primary">GD #{g.gd_number}</div>
                  <div className="meta">
                    <span>Qty available: {g.quantity_remaining}</span>
                    {g.cost != null && <span>Cost: Rs {Number(g.cost).toFixed(2)}</span>}
                    {g.mrp != null && <span>MRP: Rs {Number(g.mrp).toFixed(2)}</span>}
                  </div>
                  {low && <div className="right warn">Low</div>}
                </div>
              );
            })}
            {!gdOptions.length && <div className="empty">No stock available for this item.</div>}
          </div>
        </div>
      </Modal>

      {/* Add Customer Modal */}
      <Modal show={showCustomerModal} onHide={() => setShowCustomerModal(false)} size="lg" restoreFocus>
        <Modal.Header closeButton className="dark">
          <Modal.Title>Add New Customer</Modal.Title>
        </Modal.Header>
        <Modal.Body className="dark">
          <AddCustomerForm
            onSuccess={(newCustomer) => {
              setShowCustomerModal(false);
              setSelectedCustomer(newCustomer.id);
              setSelectedCustomerData(newCustomer);
              setWithholdingRate(newCustomer.filer_status === 'filer' ? 0.5 : 1);
              setCustomers(prev => [...prev, newCustomer]);
              setToastMessage(`✅ Customer "${newCustomer.name}" added successfully`);
              setShowToast(true);
              // jump into product browsing flow
              setShowItemPicker(true);
              setHighlightIndex(0);
              setTimeout(() => itemFilterRef.current?.focus(), 0);
            }}
          />
        </Modal.Body>
      </Modal>

      {/* Confirm Create Invoice */}
      <Modal show={showConfirmModal} onHide={() => setShowConfirmModal(false)} centered restoreFocus>
        <div className="modal-header dark">
          <h5 className="m-0">Create Invoice Now?</h5>
          <button className="icon" onClick={() => setShowConfirmModal(false)} aria-label="Close"><FaTimes aria-hidden /></button>
        </div>
        <div className="modal-body dark">
          <p className="mb-3">Press <b>Enter</b> to confirm. Press <b>Esc</b> to cancel and continue adding items.</p>
          <div className="actions" style={{justifyContent:'flex-end', gap:'.5rem'}}>
            <button className="btn" onClick={() => setShowConfirmModal(false)}>No, continue</button>
            <button className="btn primary" onClick={handleSubmit}>Yes, create invoice</button>
          </div>
        </div>
      </Modal>

      <ToastContainer position="bottom-end" className="p-3">
        <Toast onClose={() => setShowToast(false)} show={showToast} delay={4000} autohide bg="dark">
          <Toast.Body className="text-white">{toastMessage}</Toast.Body>
        </Toast>
      </ToastContainer>

      {/* THEME CSS — higher contrast, clearer focus & active states */}
      <style>{`
        :root{
          --bg:#0b0c10;
          --panel:#13141a;
          --soft:#1a1b22;
          --brand:#ff4c4c;
          --brand-weak:rgba(255,76,76,.28);
          --fg:#f7f7fb;
          --muted:#c8c8d1;
          --ring:#ffd2d2;
          --focus:#fff2f2;
          --green:#3fd18a;
        }
        .sales-page { min-height:100vh; padding:2rem; color:var(--fg); background:
          radial-gradient(1200px 800px at -10% -10%, rgba(255,76,76,.08), transparent 60%),
          var(--bg); display:flex; flex-direction:column; gap:1rem; }
        .header{ display:grid; grid-template-columns:1fr auto; gap:1rem; align-items:center; }
        .title-wrap{ display:flex; align-items:center; gap:.6rem; }
        .title-icon{ color:var(--brand); filter:drop-shadow(0 2px 10px rgba(255,76,76,.35)); }
        .title{ margin:0; font-size:1.65rem; color:var(--fg); letter-spacing:.3px; }
        .controls{ display:flex; gap:.75rem; flex-wrap:wrap; justify-content:flex-end; }
        .select-wrap{ display:grid; gap:.35rem; }
        .select-wrap label{ font-size:.8rem; color:var(--muted); }
        .select, .search-wrap, .chip, .btn.ghost{
          display:inline-flex; align-items:center; gap:.5rem; padding:.6rem .8rem; border-radius:12px;
          border:1px solid var(--brand-weak); background:var(--soft); box-shadow:0 4px 16px rgba(0,0,0,.25);
        }
        .select select{ background:transparent; color:var(--fg); border:none; outline:none; min-width:190px; }
        .search-wrap{ width:100%; max-width:760px; }
        .search-wrap input{ background:transparent; color:var(--fg); border:none; outline:none; width:100%; }
        .search-wrap input:focus{ outline:2px solid var(--ring); border-radius:8px; box-shadow:0 0 0 3px rgba(255,76,76,.25); }
        .search-icon{ color:var(--muted); }
        .btn{ cursor:pointer; border:1px solid rgba(255,76,76,.45); background:rgba(255,76,76,.12); color:var(--fg);
          padding:.55rem .8rem; border-radius:10px; transition:.15s; }
        .btn:hover{ transform:translateY(-1px); box-shadow:0 8px 22px rgba(255,76,76,.25); }
        .btn.primary{ border-color:rgba(255,76,76,.7); background:rgba(255,76,76,.22); font-weight:700; }
        .btn.ghost{ background:rgba(255,255,255,.04); }
        .chip{ gap:.5rem; border:1px dashed rgba(255,255,255,.14); }
        .chip.ghost{ opacity:.9; }
        .muted{ color:var(--muted); }
        .card{ width:100%; max-width:1200px; margin-inline:auto; border-radius:16px; border:1px solid rgba(255,255,255,.08);
          background:linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.02)); box-shadow:0 6px 26px rgba(0,0,0,.3); padding:1rem; }
        .section-head{ display:flex; align-items:baseline; gap:.75rem; margin-bottom:.5rem; }
        .section-head h3{ margin:0; display:flex; align-items:center; gap:.5rem; font-size:1.08rem; }
        .row-g{ display:flex; gap:.75rem; align-items:center; flex-wrap:wrap; }
        .quick-results{ margin-top:.6rem; display:grid; gap:.45rem; }
        .picker-list{ max-height:60vh; overflow:auto; display:grid; gap:.45rem; }
        .picker-row{ display:grid; grid-template-columns:1fr auto; gap:.5rem; align-items:center; padding:.7rem .8rem; border-radius:12px;
          border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.03); transition:.12s; cursor:pointer; }
        .picker-row:hover,.picker-row.active{ background:rgba(255,76,76,.16); outline:2px solid var(--brand-weak); }
        .picker-row:focus-within{ outline:2px solid var(--focus); }
        .picker-row .primary{ font-weight:600; }
        .picker-row .meta{ display:flex; gap:.6rem; flex-wrap:wrap; color:var(--muted); font-size:.9rem; }
        .picker-row .pill{ border:1px solid rgba(255,255,255,.18); border-radius:999px; padding:0 .5rem; }
        .picker-row .right{ font-weight:700; opacity:.9; }
        .picker-row .right.warn{ color:#ff9d9d; }
        .table-wrap{ overflow:auto; border-radius:12px; outline:none; }
        .table{ width:100%; border-collapse:separate; border-spacing:0; }
        .table thead th{ position:sticky; top:0; background:#1a1313; color:#fff; text-align:left; padding:.8rem 1rem; font-weight:700; letter-spacing:.2px; border-bottom:1px solid rgba(255,76,76,.25); z-index:1;}
        .table tbody td{ padding:.65rem 1rem; border-bottom:1px solid rgba(255,255,255,.08); vertical-align:middle; }
        .table tbody tr:hover{ background:rgba(255,255,255,.04); }
        .table input{ width:7rem; background:#15151b; border:1px solid rgba(255,255,255,.2); color:#fff; padding:.42rem .5rem; border-radius:8px; }
        .table input:focus{ outline:2px solid var(--ring); box-shadow:0 0 0 3px rgba(255,76,76,.25); }
        .row-active{ box-shadow: inset 0 0 0 2px rgba(255,76,76,.35); }
        .td-primary{ font-weight:600; }
        .td-sub{ color:var(--muted); font-size:.85rem; }
        .warn{ color:#ff9d9d; }
        .low-stock{ box-shadow: inset 0 0 0 100vmax rgba(255,76,76,.05); }
        .totals{ display:flex; gap:1.3rem; flex-wrap:wrap; padding:.9rem 0 0; color:#f0eaea; }
        .actions{ display:flex; justify-content:flex-end; padding-top:.75rem; }
        .modal-header.dark,.modal-body.dark{ background:#121218; color:#fff; border-bottom:1px solid rgba(255,76,76,.2); }
        .modal-body.dark{ border-top:none; }
        .icon{ background:none; border:none; color:#fff; cursor:pointer; }
        .icon.danger{ color:#ff9d9d; }
        .empty{ text-align:center; padding:1rem; color:var(--muted); }
        .mono{ font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace; }
        .sr-only{ position:absolute !important; height:1px; width:1px; overflow:hidden; clip:rect(1px, 1px, 1px, 1px); white-space:nowrap; }
        @media (max-width:576px){ .title{font-size:1.35rem;} }
      `}</style>
    </div>
  );
};

export default SalesInvoiceForm;
