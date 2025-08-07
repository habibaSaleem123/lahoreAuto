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
import StockReportPage from './components/StockReportPage';
import SalesReportPage from './components/SalesReportPage';
import ReportsHub from './components/ReportsHub';

function App() {
  return (
    <Router>
      <Header />
      <Routes>
        {/* Public Route */}
        <Route path="/login" element={<Login />} />

        {/* Dashboard Page - Now default */}
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

        {/* All Modules Below */}
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
        <Route
          path="/reports"
          element={
            <PrivateRoute>
              <ReportsHub />
            </PrivateRoute>
          }
        />
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
      </Routes>
    </Router>
  );
}

export default App;
