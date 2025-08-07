const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

// Now use the function
router.get('/stock', reportController.getStockReport);

module.exports = router;
