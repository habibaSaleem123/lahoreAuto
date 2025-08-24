const express = require('express');
const router = express.Router();

// ✅ path is relative to /server/routes
//    ../controllers/itemsController.js
const items = require('../controllers/ itemsController');

router.get('/search', items.searchItems);
router.get('/:itemId/availability', items.getItemAvailability);

module.exports = router;
