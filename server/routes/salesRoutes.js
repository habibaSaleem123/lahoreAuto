const express = require('express');
const router = express.Router();
const salesController = require('../controllers/salesController');
const multer = require('multer');
const path = require('path');
const upload = multer({ dest: 'uploads/receipts/' });


router.get('/invoice/:id', salesController.getInvoiceById);
router.get('/invoices', salesController.getAllInvoices);
router.post('/create-invoice', salesController.createInvoice);
router.post('/export-fbr', salesController.exportInvoicesToFBR);
router.delete('/invoice/:invoice_number', salesController.deleteInvoice);

router.post('/invoice/:invoice_number/mark-paid', upload.single('receipt'), salesController.markInvoiceAsPaid);


module.exports = router;



