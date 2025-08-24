// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './assets/styles/bootstrap.custom.css';
import './assets/styles/index.css';

import PrivateRoute from './components/PrivateRoute';
import Header from './components/Header';
import Login from './components/Login';
import ModulesPage from './components/ModulesPage';

import GdEntryForm from './components/GdEntryForm';
import GdListPage from './components/GdListPage';
import GdDetailsPage from './components/GdDetailsPage';
import StockInPage from './components/StockInPage';
import StockSummaryPage from './components/StockSummaryPage';
import SalesInvoiceForm from './components/SalesInvoiceForm';
import InvoiceListPage from './components/InvoiceListPage';
import InvoiceView from './components/InvoiceView';
import ReturnPage from './components/ReturnPage';
import CustomerListPage from './components/CustomerListPage';
import PaymentsEntryPage from './components/PaymentsEntryPage';
import BankListPage from './components/BankListPage';

import ReportsHub from './components/ReportsHub';
import StockReportPage from './components/StockReportPage';
import SalesReportPage from './components/SalesReportPage';
import TaxReportPage from './components/TaxReportPage';
import CustomerLedgerPage from './components/CustomerLedgerPage';

// ⬇️ NEW: Profit Summary
import ProfitSummaryPage from './components/ProfitSummaryPage';

function App() {
  return (
    <Router>
      <Header />
      <Routes>
        {/* Public Route */}
        <Route path="/login" element={<Login />} />

        {/* Dashboard (default) */}
        <Route
          path="/"
          element={
            <PrivateRoute>
              <ModulesPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/modules"
          element={
            <PrivateRoute>
              <ModulesPage />
            </PrivateRoute>
          }
        />

        {/* Core modules */}
        <Route
          path="/entry-form"
          element={
            <PrivateRoute>
              <GdEntryForm />
            </PrivateRoute>
          }
        />
        <Route
          path="/gd-list"
          element={
            <PrivateRoute>
              <GdListPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/gd/:id"
          element={
            <PrivateRoute>
              <GdDetailsPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/stock-in"
          element={
            <PrivateRoute>
              <StockInPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/stock-summary"
          element={
            <PrivateRoute>
              <StockSummaryPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/sales"
          element={
            <PrivateRoute>
              <SalesInvoiceForm />
            </PrivateRoute>
          }
        />
        <Route
          path="/invoice/:invoiceId"
          element={
            <PrivateRoute>
              <InvoiceView />
            </PrivateRoute>
          }
        />
        <Route
          path="/invoices"
          element={
            <PrivateRoute>
              <InvoiceListPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/returns"
          element={
            <PrivateRoute>
              <ReturnPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/customers"
          element={
            <PrivateRoute>
              <CustomerListPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/payments"
          element={
            <PrivateRoute>
              <PaymentsEntryPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/banks"
          element={
            <PrivateRoute>
              <BankListPage />
            </PrivateRoute>
          }
        />

        {/* Reports hub */}
        <Route
          path="/reports"
          element={
            <PrivateRoute>
              <ReportsHub />
            </PrivateRoute>
          }
        />

        {/* Individual reports */}
        <Route
          path="/reports/stock"
          element={
            <PrivateRoute>
              <StockReportPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/reports/sales"
          element={
            <PrivateRoute>
              <SalesReportPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/reports/tax"
          element={
            <PrivateRoute>
              <TaxReportPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/reports/ledger/customer"
          element={
            <PrivateRoute>
              <CustomerLedgerPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/reports/profit"
          element={
            <PrivateRoute>
              <ProfitSummaryPage />
            </PrivateRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
