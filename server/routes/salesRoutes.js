const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();

const salesController = require('../controllers/salesController');

// Ensure upload dir exists: server/uploads/receipts
const receiptsDir = path.join(__dirname, '../uploads/receipts');
if (!fs.existsSync(receiptsDir)) fs.mkdirSync(receiptsDir, { recursive: true });

// Configure Multer to save into /uploads/receipts with controlled filenames
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, receiptsDir),
  filename: (req, file, cb) => {
    const safe = (file.originalname || 'receipt').replace(/\s+/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  }
});
const upload = multer({ storage });

// Routes
router.get('/invoice/:id', salesController.getInvoiceById);
router.get('/invoices', salesController.getAllInvoices);
router.get('/invoice/:invoice_number/returns', salesController.getReturnsByInvoice);
router.get('/invoice-suggestions', salesController.getInvoiceSuggestions);

router.post('/returns', salesController.createReturn);
router.post('/create-invoice', salesController.createInvoice);
router.post('/export-fbr', salesController.exportInvoicesToFBR);
router.post('/returns/validate', salesController.validateReturnRestocks);

router.delete('/invoice/:invoice_number', salesController.deleteInvoice);

// Mark paid (with optional receipt upload)
router.post('/invoice/:invoice_number/mark-paid', upload.single('receipt'), salesController.markInvoiceAsPaid);

module.exports = router;
