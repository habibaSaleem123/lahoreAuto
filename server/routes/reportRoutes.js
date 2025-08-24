// server/routes/reportRoutes.js
const express = require('express');
const router = express.Router();
const reports = require('../controllers/reportController');

router.get('/stock/summary', reports.getStockSummary);
router.get('/stock/ledger',  reports.getStockLedger);
router.get('/profit/summary', reports.profitSummary);
module.exports = router;
