const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'payments');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = file.originalname.split('.')[0].replace(/\s/g, '_');
    cb(null, `${name}_${Date.now()}${ext}`);
  }
});

const upload = multer({ storage });

// ✅ Route for creating payment with file upload
router.post('/', upload.single('receipt'), paymentController.createPayment);


module.exports = router;
