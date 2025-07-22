// src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './assets/styles/bootstrap.custom.css';
import './assets/styles/index.css';
import Header from './components/Header';
import GdEntryForm from './components/GdEntryForm';
import GdListPage from './components/GdListPage';
import GdDetailsPage from './components/GdDetailsPage';
import SalesInvoiceForm from './components/SalesInvoiceForm';
import StockInPage from './components/StockInPage';
import StockSummaryPage from './components/StockSummaryPage'; 
import InvoiceView from './components/InvoiceView'; 
import InvoiceListPage from './components/InvoiceListPage'; 


function App() {
  return (
    <Router>
      <div>
        <Header />
        <Routes>
          <Route path="/entry-form" element={<GdEntryForm />} />
          <Route path="/gd-list" element={<GdListPage />} />
          <Route path="/gd/:id" element={<GdDetailsPage />} />
          <Route path="/stock-in" element={<StockInPage />} />
          <Route path="/stock-summary" element={<StockSummaryPage />} />
          <Route path="/sales" element={<SalesInvoiceForm />} /> 
          <Route path="/invoice/:invoiceId" element={<InvoiceView />} />
          <Route path="/invoices" element={<InvoiceListPage />} />


          <Route path="/" element={<GdEntryForm />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
