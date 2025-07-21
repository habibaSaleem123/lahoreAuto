const express = require('express');
const router = express.Router();
const gdController = require('../controllers/gdController');

// 💡 Alias GET /api/gds → same as /api/gd-list
router.get('/gds', gdController.getFilteredGds); // <== Add this line if not present

// Existing (already fine)
router.post('/gd-entry', gdController.createGD);
router.get('/gd-list', gdController.getFilteredGds);
router.get('/gd-details/:id', gdController.getGdDetails);
router.get('/gds/:id/items', gdController.getItemsByGd); // for invoice
router.put('/gd-items/:id', gdController.updateGdItems);

module.exports = router;
