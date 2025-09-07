// server/routes/items.js
const express = require('express');
const router = express.Router();
const items = require('../controllers/itemsController');

// Because server.js mounts at /api/items, these become:
//   GET /api/items/search
//   GET /api/items/:id/availability
router.get('/search', items.searchItems);
router.get('/:id/availability', items.getItemAvailability);


module.exports = router;
