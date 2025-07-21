const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');

router.get('/unstocked-gds', stockController.getUnstockedGds);
router.post('/stock-in/:gdId', stockController.processStockIn);

// routes/stockRoutes.js
router.get('/summary', stockController.getStockSummary);

router.get('/summary-with-audit', stockController.getStockSummaryWithAudit);

module.exports = router;
