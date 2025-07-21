const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');

router.get('/customers', customerController.getCustomers);
router.post('/customers', customerController.addCustomer);

module.exports = router;
