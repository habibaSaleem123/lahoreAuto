/*
  SalesInvoiceForm — Mind‑Blowing Revamp (drop‑in) — FIXED
  --------------------------------------------------------
  Changes in this build
  - Rate formatting: always 2 decimals (e.g., 129.9023 → 129.90)
  - Rate clamp: strictly BELOW MRP/retail_price; auto‑adjust with toast
  - Keyboard flow: Enter opens customer picker on load; select → auto opens item picker
  - Keyboard: Ctrl/Cmd + Enter anywhere → open Confirm; Ctrl/Cmd + Enter inside confirm → submit
  - Prevent row deletion when Backspace/Delete is pressed inside Qty/Rate inputs
  - Minor robustness: safe numeric parsing + truncation helper; better default sale rate under MRP
*/

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Modal, Toast, ToastContainer, ProgressBar } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import {
  FaUserTag, FaSearch, FaShoppingBasket, FaLayerGroup, FaCashRegister, FaPlus,
  FaTrash, FaTimes, FaKeyboard, FaMagic, FaUndo, FaChevronDown,
  FaInfoCircle
} from 'react-icons/fa';
import { AnimatePresence, motion } from 'framer-motion';
import AddCustomerForm from './AddCustomerForm';

const ENTER_DOUBLE_MS = 350;
const LOW_STOCK_THRESHOLD = 40;
const AUTOSAVE_KEY = 'sales_invoice_draft_v2';

// --- helpers ---------------------------------------------------------------
const n = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const truncate2 = (v) => Math.sign(n(v)) * Math.floor(Math.abs(n(v)) * 100) / 100; // 129.907 → 129.90
const to2 = (v) => truncate2(v).toFixed(2);

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
  const [activeLineIndex, setActiveLineIndex] = useState(-1);

  // Taxes
  const [taxSection, setTaxSection] = useState('236H');
  const [withholdingRate, setWithholdingRate] = useState(1);

  // UI
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false); // Ctrl+K command palette

  // Flow / focus
  const [focusSection, setFocusSection] = useState('customer');
  const lastEnterRef = useRef(0);
  const searchInputRef = useRef(null);
  const customerFilterRef = useRef(null);
  const itemFilterRef = useRef(null);
  const tableWrapRef = useRef(null);

  // Refs
  const itemPickerRowRefs = useRef([]);
  const gdPickerRowRefs = useRef([]);
  const quickResultRowRefs = useRef([]);
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
        setToastMessage('⚠️ Failed to fetch customers: ' + (err?.message || 'Unknown error'));
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
          setToastMessage('⚠️ Failed to fetch items: ' + (err?.message || 'Unknown error'));
          setShowToast(true);
        });
    }, 180);
    return () => clearTimeout(t);
  }, [itemQuery]);

  // Autosave & hydrate draft
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.formItems) setFormItems(d.formItems.map(it => ({...it, sale_rate: truncate2(it.sale_rate)})));
        if (d && d.selectedCustomer) {
          setSelectedCustomer(d.selectedCustomer);
          setSelectedCustomerData(d.selectedCustomerData || null);
        }
        if (d && d.taxSection) setTaxSection(d.taxSection);
        if (d && typeof d.withholdingRate === 'number') setWithholdingRate(d.withholdingRate);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const payload = {
      formItems,
      selectedCustomer,
      selectedCustomerData,
      taxSection,
      withholdingRate
    };
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload)); } catch {}
  }, [formItems, selectedCustomer, selectedCustomerData, taxSection, withholdingRate]);

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.toLowerCase();
    return customers.filter(c => c.name?.toLowerCase().includes(q) || c.business_name?.toLowerCase().includes(q));
  }, [customers, customerQuery]);

  const filteredItems = useMemo(() => {
    const q = itemQuery.toLowerCase();
    return items.filter(i => i.description?.toLowerCase().includes(q) || i.hs_code?.toString().includes(q));
  }, [items, itemQuery]);

  useEffect(() => {
    // keep highlightIndex valid as lists change
    const list = (showCustomerPicker ? filteredCustomers : showItemPicker ? filteredItems : showGdPicker ? gdOptions : []);
    setHighlightIndex(i => clampIndex(i, list));
  }, [customers, items, gdOptions, showCustomerPicker, showItemPicker, showGdPicker, filteredCustomers, filteredItems, clampIndex]);

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
    setWithholdingRate(c.filer_status === 'filer' ? 0.5 : 1);
    setShowCustomerPicker(false);
    setFocusSection('search');
    // Auto open items picker after choosing a customer
    setShowItemPicker(true);
    setHighlightIndex(0);
    setTimeout(() => itemFilterRef.current?.focus(), 0);
  };

  const openGdPicker = async (item) => {
    setItemForGd(item);
    setFocusSection('gd');
    setHighlightIndex(0);
    try {
      const res = await axios.get(`/api/items/${item.item_id}/availability`);
      const opts = (res.data || []).filter(g => n(g.quantity_remaining) > 0);
      setGdOptions(opts);
    } catch (err) {
      setToastMessage('⚠️ Failed to fetch stock batches: ' + (err?.message || 'Unknown error'));
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
    const retail = n(itemForGd.retail_price, 0);
    const base = n(itemForGd.sale_price, retail);
    // ensure default sale_rate is strictly below MRP
    const initialRate = truncate2(Math.min(base, retail > 0 ? retail - 0.01 : base));
    setFormItems(prev => {
      const next = [
        ...prev,
        {
          item_id: itemForGd.item_id,
          description: itemForGd.description,
          hs_code: itemForGd.hs_code,
          unit: itemForGd.unit,
          retail_price: n(itemForGd.retail_price, 0),
          sale_rate: initialRate,
          quantity: 0,
          gd_id: gd.gd_id,
          gd_number: gd.gd_number,
          max_qty: n(gd.quantity_remaining, 0),
          cost: gd.cost ?? null,
          mrp: gd.mrp ?? null,
        },
      ];
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
      const max = n(next[idx].max_qty, 0);
      let qty = n(value, 0);
      if (qty < 0) qty = 0;
      if (qty > max) qty = max;
      next[idx].quantity = qty;
      return next;
    });
  };

  const adjustQty = (idx, delta) => {
    setFormItems(prev => {
      const next = [...prev];
      const max = n(next[idx].max_qty, 0);
      let qty = n(next[idx].quantity, 0) + delta;
      if (qty < 0) qty = 0;
      if (qty > max) qty = max;
      next[idx].quantity = qty;
      return next;
    });
  };

  const handleRateChange = (idx, value) => {
    setFormItems(prev => {
      const next = [...prev];
      const cap = n(next[idx].retail_price, Infinity);
      let rate = truncate2(value);
      if (rate < 0) rate = 0;
      if (rate >= cap) {
        // strictly below MRP; choose cap - 0.01 (not below 0)
        const adjusted = Math.max(0, truncate2(cap - 0.01));
        rate = adjusted;
        setToastMessage('ℹ️ Rate must be below MRP; adjusted.');
        setShowToast(true);
      }
      next[idx].sale_rate = rate;
      return next;
    });
  };

  const formatRateOnBlur = (idx) => {
    setFormItems(prev => {
      const next = [...prev];
      next[idx].sale_rate = truncate2(next[idx].sale_rate);
      return next;
    });
  };

  const removeLine = (idx) =>
    setFormItems(prev => {
      const next = prev.filter((_, i) => i !== idx);
      let newActive = -1;
      if (next.length) newActive = Math.min(idx, next.length - 1);
      setActiveLineIndex(newActive);
      return next;
    });

  const undoLastLine = () => {
    setFormItems(prev => prev.slice(0, -1));
    setActiveLineIndex(-1);
  };

  const calculateLineTotal = (item) => n(item.quantity, 0) * truncate2(n(item.sale_rate, 0));
  const grossTotal = formItems.reduce((s, it) => s + calculateLineTotal(it), 0);
  const salesTax   = formItems.reduce((s, it) => s + n(it.quantity,0) * n(it.retail_price,0) * 0.18, 0); // keep consistent w/ server by default
  const withholdingTax = grossTotal * (n(withholdingRate) / 100);

  const handleSubmit = async () => {
    const payload = {
      customer_id: selectedCustomer,
      items: formItems
        .filter(i => n(i.quantity) > 0)
        .map(l => ({
          item_id: l.item_id,
          gd_entry_id: l.gd_id,
          quantity: n(l.quantity),
          sale_rate: truncate2(l.sale_rate),
          retail_price: n(l.retail_price),
          unit: l.unit,
        })),
      withholding_rate: n(withholdingRate) / 100,
      tax_section: taxSection,
    };

    if (!payload.customer_id) {
      setToastMessage('Select a customer before creating the invoice.');
      setShowToast(true);
      return;
    }
    if (!payload.items.length) {
      setToastMessage('Add at least one item with quantity > 0.');
      setShowToast(true);
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await axios.post('/api/sales/create-invoice', payload);
      try { localStorage.removeItem(AUTOSAVE_KEY); } catch {}
      navigate(`/invoice/${res.data.invoice_number}`);
    } catch (err) {
      setToastMessage('❌ Error creating invoice: ' + (err.response?.data?.error || err.message));
      setShowToast(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Global keyboard
  useEffect(() => {
    function onKeyDown(e) {
      const tag = (e.target?.tagName || '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
      // allow global confirm even while not typing in plain body
      if (!isTyping) {
        // Command palette (Ctrl/Cmd+K)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
          setPaletteOpen(true);
          e.preventDefault();
          return;
        }
        // Confirm: Ctrl/Cmd + Enter
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          setShowConfirmModal(true); setFocusSection('confirm'); e.preventDefault(); return;
        }
        // Save (legacy): Ctrl/Cmd + S
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          setShowConfirmModal(true); setFocusSection('confirm'); e.preventDefault(); return;
        }
      }

      const inModal = showCustomerPicker || showItemPicker || showGdPicker || showConfirmModal || paletteOpen;

      if (inModal && ['ArrowDown','ArrowUp'].includes(e.key)) {
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

      if (showConfirmModal) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { handleSubmit(); e.preventDefault(); return; }
        if (e.key === 'Escape') { setShowConfirmModal(false); e.preventDefault(); return; }
      }

      if (e.key === 'Escape') {
        if (showGdPicker) { setShowGdPicker(false); setFocusSection('search'); }
        else if (showItemPicker) setShowItemPicker(false);
        else if (showCustomerPicker) setShowCustomerPicker(false);
        else if (paletteOpen) setPaletteOpen(false);
        else if (showShortcuts) setShowShortcuts(false);
        e.preventDefault();
        return;
      }

      const dbl = e.key === 'Enter' ? isDoubleEnter() : false;

      // --- CUSTOMER SECTION ---
      if (focusSection === 'customer') {
        // Single Enter opens customer picker immediately
        if (e.key === 'Enter') {
          setShowCustomerPicker(true); setHighlightIndex(0);
          setTimeout(() => customerFilterRef.current?.focus(), 0);
          e.preventDefault();
          return;
        }
        // fallback: if already selected and Enter again go to items
        if (selectedCustomer && dbl) {
          setFocusSection('search');
          if (!showItemPicker) { setShowItemPicker(true); setTimeout(() => itemFilterRef.current?.focus(), 0); }
          e.preventDefault();
        }
        return;
      }

      // --- SEARCH SECTION (quick pick) ---
      if (focusSection === 'search') {
        if (e.code === 'Space' && formItems.length > 0) {
          setFocusSection('lines');
          setActiveLineIndex(prev => (prev === -1 ? 0 : prev));
          setTimeout(() => tableWrapRef.current?.focus(), 0);
          e.preventDefault();
          return;
        }
        const list = filteredItems;
        if (e.key === 'Enter') { // single Enter opens full browser for items
          setShowItemPicker(true); setHighlightIndex(0); setTimeout(() => itemFilterRef.current?.focus(), 0); e.preventDefault(); return;
        }
        // quick: ArrowRight to pick highlighted quick result
        if (list.length > 0 && (e.key === 'ArrowRight')) { const item = list[clampIndex(highlightIndex, list)]; openGdPicker(item); e.preventDefault(); return; }
      }

      if (focusSection === 'gd' && showGdPicker && e.key === 'Enter') {
        const list = gdOptions; if (list.length > 0) { const opt = list[clampIndex(highlightIndex, list)]; addLineFromGd(opt); }
        e.preventDefault(); return;
      }

      // --- LINES GRID ---
      if (focusSection === 'lines') {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { setShowConfirmModal(true); setFocusSection('confirm'); e.preventDefault(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { undoLastLine(); e.preventDefault(); return; }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    focusSection, filteredItems, gdOptions, selectedCustomer, highlightIndex,
    showCustomerPicker, showItemPicker, showGdPicker, showConfirmModal, paletteOpen,
    clampIndex, formItems.length
  ]);

  // Quick results keyboard nav
  const handleSearchKeyNav = (e) => {
    const list = filteredItems;
    if (!list.length) {
      if (e.code === 'Space' && formItems.length > 0) {
        setFocusSection('lines');
        setActiveLineIndex(prev => (prev === -1 ? 0 : prev));
        setTimeout(() => tableWrapRef.current?.focus(), 0);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      setHighlightIndex(i => { const next = clampIndex(i + (e.key === 'ArrowDown' ? 1 : -1), list); ensureRowVisible(quickResultRowRefs, next); return next; });
      e.preventDefault();
    } else if (e.key === 'Enter') {
      // in search input, Enter opens full picker now; keep ArrowRight for instant GD
      setShowItemPicker(true); setHighlightIndex(0); setTimeout(() => itemFilterRef.current?.focus(), 0); e.preventDefault();
    } else if (e.code === 'Space') {
      if (formItems.length > 0) { setFocusSection('lines'); setActiveLineIndex(prev => (prev === -1 ? 0 : prev)); setTimeout(() => tableWrapRef.current?.focus(), 0); e.preventDefault(); }
    }
  };

  // Lines grid keyboard
  const onLinesKeyDown = (e) => {
    if (!formItems.length) return;

    // If typing inside an input, don't treat Backspace/Delete as remove-row
    const tag = (e.target?.tagName || '').toLowerCase();
    const isInput = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
    if (isInput && (e.key === 'Backspace' || e.key === 'Delete')) {
      return; // let the field handle it
    }

    if (activeLineIndex === -1) setActiveLineIndex(0);
    const last = formItems.length - 1;

    if (e.key === 'ArrowDown') { const next = Math.min(activeLineIndex + 1, last); setActiveLineIndex(next); lineRowRefs.current[next]?.focus(); e.preventDefault(); return; }
    if (e.key === 'ArrowUp')   { const prev = Math.max(activeLineIndex - 1, 0);   setActiveLineIndex(prev); lineRowRefs.current[prev]?.focus(); e.preventDefault(); return; }
    if (e.key === 'ArrowLeft') { qtyRefs.current[activeLineIndex]?.focus(); e.preventDefault(); return; }
    if (e.key === 'ArrowRight'){ rateRefs.current[activeLineIndex]?.focus(); e.preventDefault(); return; }

    if (e.key.toLowerCase() === 'q') { qtyRefs.current[activeLineIndex]?.focus(); e.preventDefault(); return; }
    if (e.key.toLowerCase() === 'r') { rateRefs.current[activeLineIndex]?.focus(); e.preventDefault(); return; }

    if (e.key === '+' || e.key === '=') { adjustQty(activeLineIndex, 1); e.preventDefault(); return; }
    if (e.key === '-') { adjustQty(activeLineIndex, -1); e.preventDefault(); return; }
    if (e.key === 'PageUp')   { adjustQty(activeLineIndex, 5); e.preventDefault(); return; }
    if (e.key === 'PageDown') { adjustQty(activeLineIndex, -5); e.preventDefault(); return; }

    if (e.key === 'Delete' || e.key === 'Backspace') { removeLine(activeLineIndex); e.preventDefault(); return; }
  };

  const CustomerBadge = () => (
    selectedCustomerData ? (
      <div className="chip"><FaUserTag /> {selectedCustomerData.name} <span className="muted">({selectedCustomerData.business_name})</span></div>
    ) : (
      <div className="chip ghost"><FaUserTag /> Select customer</div>
    )
  );

  const LowStockDot = ({ warn }) => (
    <span className={`dot ${warn ? 'warn' : ''}`} aria-label={warn ? 'Low stock' : 'In stock'} />
  );

  return (
    <div className="sales-page">
      {/* Header */}
      <header className="header">
        <div className="title-wrap">
          <FaCashRegister className="title-icon" aria-hidden />
          <h2 className="title">Create Sales Invoice</h2>
          <span className="badge"><FaMagic /> Smart</span>
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
            <input id="wht" type="number" step="0.1" min="0" max="100" value={withholdingRate}
                   onChange={(e) => setWithholdingRate(Number.isFinite(+e.target.value) ? +e.target.value : 0)} aria-label="Withholding percentage" />
          </div>

          <button className="btn ghost" onClick={() => setShowCustomerModal(true)} aria-label="Add customer">
            <FaPlus aria-hidden /> Add Customer
          </button>

          <button className="btn" onClick={() => setShowShortcuts(true)} aria-label="Keyboard shortcuts">
            <FaKeyboard /> Shortcuts
          </button>
        </div>
      </header>

      {/* Grid layout: left search, middle results, right cart */}
      <div className="grid">
        {/* Left — Customer & Search */}
        <section className="card sticky" aria-labelledby="customer-section">
          <div className="section-head">
            <h3 id="customer-section"><FaUserTag aria-hidden /> Customer</h3>
            <small>Enter = browse • Ctrl+K = Palette</small>
          </div>

          <div className="row-g">
            <CustomerBadge />
            <div className="search-wrap">
              <FaSearch className="search-icon" aria-hidden />
              <input
                placeholder="Type to filter customers (Enter opens list)…"
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                onFocus={() => setFocusSection('customer')}
                aria-label="Filter customers"
              />
              <button className="btn" onClick={() => { setShowCustomerPicker(true); setHighlightIndex(0); setTimeout(() => customerFilterRef.current?.focus(), 0); }} aria-haspopup="dialog" aria-controls="customer-picker" aria-expanded={showCustomerPicker}>
                Browse
              </button>
            </div>
          </div>

          <div className="divider" />

          <div className="section-head">
            <h3 id="products-section"><FaShoppingBasket aria-hidden /> Products</h3>
            <small>Enter = browse • ↑/↓ navigate • <b>Space = Selected Items</b></small>
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
            <button className="btn" disabled={!selectedCustomer} onClick={() => { setShowItemPicker(true); setHighlightIndex(0); setTimeout(()=>itemFilterRef.current?.focus(),0); }} aria-haspopup="dialog" aria-controls="item-picker" aria-expanded={showItemPicker}>
              Browse
            </button>
          </div>

          {!!filteredItems.length && selectedCustomer && (
            <div className="quick-results" role="listbox" aria-label="Quick results" aria-activedescendant={`qr-opt-${clampIndex(highlightIndex, filteredItems)}`}>
              {filteredItems.slice(0, 8).map((item, i) => {
                const low = n(item.available_total) < LOW_STOCK_THRESHOLD;
                const active = i === clampIndex(highlightIndex, filteredItems);
                return (
                  <motion.div
                    layout
                    key={item.item_id}
                    id={`qr-opt-${i}`}
                    ref={(el) => (quickResultRowRefs.current[i] = el)}
                    className={`picker-row ${active ? 'active' : ''}`}
                    role="option"
                    aria-selected={active}
                    tabIndex={0}
                    onMouseEnter={() => setHighlightIndex(i)}
                    onClick={() => openGdPicker(item)}
                    onKeyDown={(e)=>{ if(e.key==='Enter'){openGdPicker(item);} }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="primary"><LowStockDot warn={low} />{item.description}</div>
                    <div className="meta">
                      <span>HS {item.hs_code}</span>
                      <span>{item.unit}</span>
                      <span>MRP Rs {to2(item.retail_price)}</span>
                    </div>
                    <div className={`right ${low ? 'warn' : ''}`}>
                      {low ? `Low: ${item.available_total}` : `In stock: ${item.available_total}`}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>

        {/* Middle — Tips & Flow helper */}
        <section className="card" aria-labelledby="flow-section">
          <div className="section-head">
            <h3 id="flow-section"><FaInfoCircle /> Tips</h3>
          </div>
          <ul className="tips">
            <li><b>Enter</b> opens customer / item browser. <b>Ctrl/Cmd + Enter</b> confirms invoice.</li>
            <li><b>Space</b> toggles focus to Selected Items table.</li>
            <li>Use <b>Q</b>/<b>R</b> to jump between Qty and Rate. <b>PageUp/Down</b> adjusts Qty by 5.</li>
            <li>Rates always show 2 decimals and stay below <b>MRP</b>.</li>
          </ul>
          <div className="mini-stats">
            <div className="stat"><span className="label">Items in cart</span><span className="value">{formItems.length}</span></div>
            <div className="stat"><span className="label">Gross</span><span className="value">Rs {to2(grossTotal)}</span></div>
            <div className="stat"><span className="label">WHT</span><span className="value">Rs {to2(withholdingTax)}</span></div>
          </div>
          <ProgressBar now={Math.min(100, (formItems.length / 8) * 100)} label={`${formItems.length} / 8`} visuallyHidden={false} className="prog" />
        </section>

        {/* Right — Selected Items (Cart) */}
        <section className="card" aria-labelledby="lines-section">
          <div className="section-head"><h3 id="lines-section"><FaLayerGroup aria-hidden /> Selected Items</h3></div>

          {formItems.length === 0 ? (
            <div className="empty big">Press <b>Enter</b> to browse customers, pick one, then <b>Enter</b> again to browse products. Use <b>Space</b> to jump here.</div>
          ) : (
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
                    <th scope="col">HS</th>
                    <th scope="col">Unit</th>
                    <th scope="col">Retail</th>
                    <th scope="col">GD</th>
                    <th scope="col">Avail</th>
                    <th scope="col">Qty</th>
                    <th scope="col">Rate</th>
                    <th scope="col">Total</th>
                    <th scope="col" aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {formItems.map((l, idx) => {
                      const low = n(l.max_qty, 0) < LOW_STOCK_THRESHOLD;
                      return (
                        <motion.tr
                          key={`${l.item_id}-${l.gd_id}`}
                          ref={(el)=> (lineRowRefs.current[idx]=el)}
                          className={`${low ? 'low-stock' : ''} ${idx===activeLineIndex?'row-active':''}`}
                          tabIndex={-1}
                          onClick={() => { setActiveLineIndex(idx); setFocusSection('lines'); }}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          layout
                        >
                          <td>
                            <div className="td-primary">{l.description}</div>
                            <div className="td-sub">Item #{l.item_id}</div>
                          </td>
                          <td>{l.hs_code}</td>
                          <td>{l.unit}</td>
                          <td>Rs {to2(l.retail_price)}</td>
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
                                // prevent table handler from catching Backspace/Delete
                                if (e.key === 'Backspace' || e.key === 'Delete') {
                                  e.stopPropagation();
                                }
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
                              value={to2(l.sale_rate)}
                              onFocus={() => { setActiveLineIndex(idx); setFocusSection('lines'); }}
                              onChange={(e) => handleRateChange(idx, e.target.value)}
                              onBlur={() => formatRateOnBlur(idx)}
                              onKeyDown={(e) => {
                                // prevent table handler from catching Backspace/Delete
                                if (e.key === 'Backspace' || e.key === 'Delete') {
                                  e.stopPropagation();
                                }
                              }}
                            />
                          </td>
                          <td>Rs {to2(calculateLineTotal(l))}</td>
                          <td>
                            <button className="icon danger" onClick={() => removeLine(idx)} aria-label={`Remove ${l.description}`}>
                              <FaTrash aria-hidden />
                            </button>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}

          {/* Docked totals & actions */}
          <div className="totals dock" aria-live="polite">
            <div className="trow"><span>Gross</span><b>Rs {to2(grossTotal)}</b></div>
            <div className="trow"><span>Sales Tax (18%)</span><b>Rs {to2(salesTax)}</b></div>
            <div className="trow"><span>Withholding</span><b>Rs {to2(withholdingTax)}</b></div>
            <div className="actions">
              <button className="btn ghost" onClick={undoLastLine} disabled={!formItems.length}>↶ Undo</button>
              <button className="btn primary" onClick={() => setShowConfirmModal(true)} disabled={!selectedCustomer || formItems.every(i => n(i.quantity) <= 0)}>
                {isSubmitting ? 'Creating…' : '🧾 Create Invoice (Ctrl/Cmd+Enter)'}
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Customer Picker */}
      <Modal show={showCustomerPicker} onHide={() => setShowCustomerPicker(false)} size="lg" centered aria-labelledby="customer-picker" restoreFocus>
        <div className="modal-header dark">
          <h5 id="customer-picker" className="m-0">Select Customer</h5>
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
                const list = filteredCustomers; if (!list.length) return;
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { setHighlightIndex(i => clampIndex(i + (e.key==='ArrowDown'?1:-1), list)); e.preventDefault(); }
                else if (e.key === 'Enter') { const c = list[clampIndex(highlightIndex, list)]; if (c) selectCustomer(c); e.preventDefault(); }
              }}
              aria-label="Filter customers"
            />
          </div>

          <div className="picker-list" role="listbox" aria-label="Customers" aria-activedescendant={`cust-opt-${clampIndex(highlightIndex, filteredCustomers)}`}>
            {filteredCustomers.map((c, i) => (
              <div id={`cust-opt-${i}`} key={c.id} className={`picker-row ${i === highlightIndex ? 'active' : ''}`} onMouseEnter={() => setHighlightIndex(i)} onClick={() => selectCustomer(c)} role="option" aria-selected={i === highlightIndex} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') selectCustomer(c); }}>
                <div className="primary">{c.name}</div>
                <div className="meta">
                  <span>{c.business_name}</span>
                  <span className="pill">{c.filer_status === 'filer' ? 'Filer 0.5%' : 'Non‑Filer 1%'}</span>
                </div>
              </div>
            ))}
            {!filteredCustomers.length && <div className="empty">No customers found.</div>}
          </div>
        </div>
      </Modal>

      {/* Item Picker */}
      <Modal show={showItemPicker} onHide={() => setShowItemPicker(false)} size="lg" centered aria-labelledby="item-picker" restoreFocus>
        <div className="modal-header dark">
          <h5 id="item-picker" className="m-0">Select Product</h5>
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
                const list = filteredItems; if (!list.length) return;
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  setHighlightIndex(i => { const next = clampIndex(i + (e.key==='ArrowDown'?1:-1), list); ensureRowVisible(itemPickerRowRefs, next); return next; });
                  e.preventDefault();
                } else if (e.key === 'Enter') {
                  const it = list[clampIndex(highlightIndex, list)]; if (it) { setShowItemPicker(false); openGdPicker(it); }
                  e.preventDefault();
                }
              }}
              aria-label="Filter products"
            />
          </div>

          <div className="picker-list" role="listbox" aria-label="Products" aria-activedescendant={`item-opt-${clampIndex(highlightIndex, filteredItems)}`}>
            {filteredItems.map((it, i) => {
              const low = n(it.available_total) < LOW_STOCK_THRESHOLD;
              const active = i === highlightIndex;
              return (
                <div id={`item-opt-${i}`} key={it.item_id} ref={(el)=> (itemPickerRowRefs.current[i]=el)} className={`picker-row ${active ? 'active' : ''}`} onMouseEnter={() => setHighlightIndex(i)} onClick={() => { setShowItemPicker(false); openGdPicker(it); }} role="option" aria-selected={active} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') { setShowItemPicker(false); openGdPicker(it); } }}>
                  <div className="primary"><LowStockDot warn={low} />{it.description}</div>
                  <div className="meta">
                    <span>HS {it.hs_code}</span>
                    <span>{it.unit}</span>
                    <span>MRP Rs {to2(it.retail_price)}</span>
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
      <Modal show={showGdPicker} onHide={() => { setShowGdPicker(false); setFocusSection('search'); }} size="lg" centered aria-labelledby="gd-picker" restoreFocus>
        <div className="modal-header dark">
          <h5 id="gd-picker" className="m-0">Select GD Batch</h5>
          <button className="icon" onClick={() => { setShowGdPicker(false); setFocusSection('search'); }} aria-label="Close"><FaTimes aria-hidden /></button>
        </div>
        <div className="modal-body dark">
          <div className="picker-list" role="listbox" aria-label="GD batches" aria-activedescendant={`gd-opt-${clampIndex(highlightIndex, gdOptions)}`}>
            {gdOptions.map((g, i) => {
              const low = n(g.quantity_remaining) < LOW_STOCK_THRESHOLD;
              const active = i === highlightIndex;
              return (
                <div id={`gd-opt-${i}`} key={g.gd_id} ref={(el)=> (gdPickerRowRefs.current[i]=el)} className={`picker-row ${active ? 'active' : ''}`} onMouseEnter={() => setHighlightIndex(i)} onClick={() => addLineFromGd(g)} role="option" aria-selected={active} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') addLineFromGd(g); }}>
                  <div className="primary"><LowStockDot warn={low} />GD #{g.gd_number}</div>
                  <div className="meta">
                    <span>Qty available: {g.quantity_remaining}</span>
                    {g.cost != null && <span>Cost: Rs {to2(g.cost)}</span>}
                    {g.mrp != null && <span>MRP: Rs {to2(g.mrp)}</span>}
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
              setShowItemPicker(true);
              setHighlightIndex(0);
              setTimeout(() => itemFilterRef.current?.focus(), 0);
            }}
          />
        </Modal.Body>
      </Modal>

      {/* Confirm Create */}
      <Modal show={showConfirmModal} onHide={() => setShowConfirmModal(false)} centered restoreFocus>
        <div className="modal-header dark">
          <h5 className="m-0">Create Invoice Now?</h5>
          <button className="icon" onClick={() => setShowConfirmModal(false)} aria-label="Close"><FaTimes aria-hidden /></button>
        </div>
        <div className="modal-body dark">
          <p className="mb-3">Press <b>Ctrl/Cmd + Enter</b> to confirm. Press <b>Esc</b> to cancel and continue adding items.</p>
          <div className="actions" style={{justifyContent:'flex-end', gap:'.5rem'}}>
            <button className="btn" onClick={() => setShowConfirmModal(false)}>No, continue</button>
            <button className="btn primary" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Working…' : 'Yes, create invoice'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Command Palette (Ctrl/Cmd+K) */}
      <Modal show={paletteOpen} onHide={() => setPaletteOpen(false)} centered size="lg" restoreFocus>
        <div className="modal-header dark">
          <h5 className="m-0">Command Palette</h5>
          <button className="icon" onClick={() => setPaletteOpen(false)} aria-label="Close"><FaTimes aria-hidden /></button>
        </div>
        <div className="modal-body dark">
          <div className="palette">
            <input
              autoFocus
              placeholder="Search customers and products…"
              value={itemQuery || customerQuery}
              onChange={(e)=>{ setItemQuery(e.target.value); setCustomerQuery(e.target.value); setHighlightIndex(0); }}
              onKeyDown={(e)=>{
                const list = [...filteredCustomers.slice(0,5).map(c=>({type:'customer', data:c})), ...filteredItems.slice(0,7).map(i=>({type:'item', data:i}))];
                if (!list.length) return;
                if (e.key==='ArrowDown' || e.key==='ArrowUp'){ setHighlightIndex(i => clampIndex(i + (e.key==='ArrowDown'?1:-1), list)); e.preventDefault(); }
                else if (e.key==='Enter'){
                  const sel = list[clampIndex(highlightIndex, list)];
                  if (!sel) return;
                  if (sel.type==='customer') selectCustomer(sel.data);
                  else if (sel.type==='item') { setPaletteOpen(false); openGdPicker(sel.data); }
                  e.preventDefault();
                }
              }}
            />
            <div className="palette-results">
              {[...filteredCustomers.slice(0,5).map(c=>({type:'customer', data:c})), ...filteredItems.slice(0,7).map(i=>({type:'item', data:i}))].map((row, i)=> (
                <div key={(row.type==='customer'?row.data.id:row.data.item_id)+ '-' + row.type} className={`palette-row ${i===highlightIndex?'active':''}`} onMouseEnter={()=>setHighlightIndex(i)} onClick={()=>{ if(row.type==='customer') selectCustomer(row.data); else { setPaletteOpen(false); openGdPicker(row.data); } }}>
                  <div className="left">{row.type==='customer' ? '👤' : '🧺'}</div>
                  <div className="mid">
                    <div className="title">{row.type==='customer' ? row.data.name : row.data.description}</div>
                    <div className="sub">{row.type==='customer' ? row.data.business_name : `HS ${row.data.hs_code} • ${row.data.unit}`}</div>
                  </div>
                  <div className="right">{row.type==='item' ? `Stock ${row.data.available_total}` : (row.data.filer_status==='filer'?'Filer 0.5%':'Non‑Filer 1%')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Shortcuts */}
      <Modal show={showShortcuts} onHide={() => setShowShortcuts(false)} centered>
        <div className="modal-header dark">
          <h5 className="m-0"><FaKeyboard/> Keyboard Shortcuts</h5>
          <button className="icon" onClick={() => setShowShortcuts(false)} aria-label="Close"><FaTimes aria-hidden /></button>
        </div>
        <div className="modal-body dark">
          <div className="kbd-grid">
            <div><kbd>Enter</kbd> browse customers/items</div>
            <div><kbd>↑/↓</kbd> navigate lists</div>
            <div><kbd>Space</kbd> jump to Selected Items</div>
            <div><kbd>Q</kbd>/<kbd>R</kbd> focus Qty/Rate</div>
            <div><kbd>PageUp/Down</kbd> ±5 Qty</div>
            <div><kbd>Ctrl/Cmd + K</kbd> command palette</div>
            <div><kbd>Ctrl/Cmd + Enter</kbd> confirm invoice</div>
            <div><kbd>Ctrl/Cmd + Z</kbd> undo last line</div>
          </div>
        </div>
      </Modal>

      <ToastContainer position="bottom-end" className="p-3">
        <Toast onClose={() => setShowToast(false)} show={showToast} delay={3800} autohide bg="dark">
          <Toast.Body className="text-white">{toastMessage}</Toast.Body>
        </Toast>
      </ToastContainer>

      {/* THEME & LAYOUT CSS (unchanged aside from a few copy tweaks) */}
      <style>{`
        :root{ --bg:#0b0c10; --panel:#13141a; --soft:#1a1b22; --brand:#ff4c4c; --brand-weak:rgba(255,76,76,.28); --fg:#f7f7fb; --muted:#c8c8d1; --ring:#ffd2d2; --focus:#fff2f2; --green:#3fd18a; }
        .sales-page{ min-height:100vh; padding:2rem; color:var(--fg); background:radial-gradient(1200px 800px at -10% -10%, rgba(255,76,76,.08), transparent 60%), var(--bg); display:flex; flex-direction:column; gap:1rem; }
        .header{ display:grid; grid-template-columns:1fr auto; gap:1rem; align-items:center; }
        .title-wrap{ display:flex; align-items:center; gap:.6rem; }
        .title-icon{ color:var(--brand); filter:drop-shadow(0 2px 10px rgba(255,76,76,.35)); }
        .title{ margin:0; font-size:1.65rem; color:var(--fg); letter-spacing:.3px; }
        .badge{ display:inline-flex; gap:.4rem; align-items:center; font-weight:700; padding:.2rem .5rem; border-radius:999px; border:1px solid var(--brand-weak); background:rgba(255,255,255,.05); font-size:.8rem; }
        .controls{ display:flex; gap:.75rem; flex-wrap:wrap; justify-content:flex-end; }
        .select-wrap{ display:grid; gap:.35rem; }
        .select-wrap label{ font-size:.8rem; color:var(--muted); }
        .select, .search-wrap, .chip, .btn.ghost{ display:inline-flex; align-items:center; gap:.5rem; padding:.6rem .8rem; border-radius:12px; border:1px solid var(--brand-weak); background:var(--soft); box-shadow:0 4px 16px rgba(0,0,0,.25); }
        .select select{ background:transparent; color:var(--fg); border:none; outline:none; min-width:190px; }
        .search-wrap{ width:100%; }
        .search-wrap input{ background:transparent; color:var(--fg); border:none; outline:none; width:100%; }
        .search-wrap input:focus{ outline:2px solid var(--ring); border-radius:8px; box-shadow:0 0 0 3px rgba(255,76,76,.25); }
        .search-icon{ color:var(--muted); }
        .btn{ cursor:pointer; border:1px solid rgba(255,76,76,.45); background:rgba(255,76,76,.12); color:var(--fg); padding:.55rem .8rem; border-radius:10px; transition:.15s; }
        .btn:hover{ transform:translateY(-1px); box-shadow:0 8px 22px rgba(255,76,76,.25); }
        .btn.primary{ border-color:rgba(255,76,76,.7); background:rgba(255,76,76,.22); font-weight:700; }
        .btn.ghost{ background:rgba(255,255,255,.04); }
        .chip{ gap:.5rem; border:1px dashed rgba(255,255,255,.14); }
        .chip.ghost{ opacity:.9; }
        .muted{ color:var(--muted); }
        .card{ border-radius:16px; border:1px solid rgba(255,255,255,.08); background:linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.02)); box-shadow:0 6px 26px rgba(0,0,0,.3); padding:1rem; height:fit-content; }
        .card.sticky{ position:sticky; top:1rem; align-self:start; }
        .section-head{ display:flex; align-items:baseline; gap:.75rem; margin-bottom:.5rem; }
        .section-head h3{ margin:0; display:flex; align-items:center; gap:.5rem; font-size:1.08rem; }
        .row-g{ display:flex; gap:.75rem; align-items:center; flex-wrap:wrap; }
        .divider{ height:1px; background:rgba(255,255,255,.08); margin:1rem 0; }
        .grid{ display:grid; grid-template-columns: 1.1fr .9fr 1.3fr; gap:1rem; align-items:start; }
        @media (max-width: 1100px){ .grid{ grid-template-columns:1fr; } .card.sticky{ position:static; } }
        .quick-results{ margin-top:.6rem; display:grid; gap:.45rem; }
        .picker-list{ max-height:60vh; overflow:auto; display:grid; gap:.45rem; }
        .picker-row{ display:grid; grid-template-columns:1fr auto; gap:.5rem; align-items:center; padding:.7rem .8rem; border-radius:12px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.03); transition:.12s; cursor:pointer; }
        .picker-row:hover,.picker-row.active{ background:rgba(255,76,76,.16); outline:2px solid var(--brand-weak); }
        .picker-row:focus-within{ outline:2px solid var(--focus); }
        .picker-row .primary{ font-weight:600; display:flex; align-items:center; gap:.5rem; }
        .picker-row .meta{ display:flex; gap:.6rem; flex-wrap:wrap; color:var(--muted); font-size:.9rem; }
        .picker-row .pill{ border:1px solid rgba(255,255,255,.18); border-radius:999px; padding:0 .5rem; }
        .picker-row .right{ font-weight:700; opacity:.9; }
        .picker-row .right.warn{ color:#ff9d9d; }
        .table-wrap{ overflow:auto; border-radius:12px; outline:none; max-height:56vh; }
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
        .totals.dock{ display:flex; flex-direction:column; gap:.35rem; padding-top:1rem; border-top:1px dashed rgba(255,255,255,.12); }
        .trow{ display:flex; justify-content:space-between; }
        .actions{ display:flex; justify-content:flex-end; padding-top:.75rem; gap:.5rem; }
        .modal-header.dark,.modal-body.dark{ background:#121218; color:#fff; border-bottom:1px solid rgba(255,76,76,.2); }
        .modal-body.dark{ border-top:none; }
        .icon{ background:none; border:none; color:#fff; cursor:pointer; }
        .icon.danger{ color:#ff9d9d; }
        .empty{ text-align:center; padding:1rem; color:var(--muted); }
        .empty.big{ padding:2rem; font-size:1.05rem; }
        .mono{ font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace; }
        .sr-only{ position:absolute !important; height:1px; width:1px; overflow:hidden; clip:rect(1px, 1px, 1px, 1px); white-space:nowrap; }
        .dot{ width:.6rem; height:.6rem; border-radius:999px; background:rgba(100,255,100,.6); display:inline-block; }
        .dot.warn{ background:rgba(255,100,100,.85); box-shadow:0 0 0 2px rgba(255,100,100,.2); }
        .tips{ margin:0; padding-left:1rem; display:grid; gap:.35rem; }
        .mini-stats{ display:grid; grid-template-columns:repeat(3,1fr); gap:.5rem; margin-top:.75rem; }
        .stat{ padding:.6rem .8rem; border-radius:10px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.03); display:flex; align-items:center; justify-content:space-between; }
        .prog{ margin-top:.75rem; }
        .palette input{ width:100%; background:#15151b; border:1px solid rgba(255,255,255,.2); color:#fff; padding:.6rem .75rem; border-radius:10px; }
        .palette-results{ margin-top:.6rem; display:grid; gap:.4rem; max-height:50vh; overflow:auto; }
        .palette-row{ display:grid; grid-template-columns:auto 1fr auto; gap:.6rem; align-items:center; padding:.6rem .75rem; border-radius:10px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.03); cursor:pointer; }
        .palette-row.active, .palette-row:hover{ background:rgba(255,76,76,.16); outline:2px solid var(--brand-weak); }
        .palette-row .title{ font-weight:700; }
        .kbd-grid{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:.6rem; }
        kbd{ background:#22232a; border:1px solid rgba(255,255,255,.2); padding:.15rem .4rem; border-radius:6px; box-shadow:inset 0 -1px 0 rgba(255,255,255,.12); }
        @media (max-width:576px){ .title{font-size:1.35rem;} }
      `}</style>
    </div>
  );
};

export default SalesInvoiceForm;
