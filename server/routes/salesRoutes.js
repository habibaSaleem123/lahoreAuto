// routes/salesRoutes.js
const express = require('express');
const router = express.Router();
const salesController = require('../controllers/salesController');
const multer = require('multer');
const upload = multer({ dest: 'uploads/receipts/' });

router.get('/invoice/:id', salesController.getInvoiceById);
router.get('/invoices', salesController.getAllInvoices);
router.get('/invoice/:invoice_number/returns', salesController.getReturnsByInvoice);
router.get('/invoice-suggestions', salesController.getInvoiceSuggestions);

router.post('/returns', salesController.createReturn);
router.post('/create-invoice', salesController.createInvoice);
router.post('/export-fbr', salesController.exportInvoicesToFBR);
router.post('/returns/validate', salesController.validateReturnRestocks);

router.delete('/invoice/:invoice_number', salesController.deleteInvoice);
router.post('/invoice/:invoice_number/mark-paid', upload.single('receipt'), salesController.markInvoiceAsPaid);

// New delete endpoint for fully refunded invoices
router.delete('/invoice/:id', salesController.deleteInvoice);

module.exports = router;