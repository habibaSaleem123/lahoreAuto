const express = require('express');
const router = express.Router();
const gdController = require('../controllers/gdController');

// 💡 Aliases / consistency
router.get('/gds', gdController.getFilteredGds); // same as /gd-list

// Create GD entry
// Canonical:
router.post('/gd-entry', gdController.createGD);
// ✅ Alias so older/newer frontends that use /api/gd also work:
router.post('/gd', gdController.createGD);

// List + details
router.get('/gd-list', gdController.getFilteredGds);
router.get('/gd-details/:id', gdController.getGdDetails);

// Invoice/inventory-facing items
router.get('/gds/:id/items', gdController.getItemsByGd);

// Update items (recompute costs & prices, then avg landed)
router.put('/gd-items/:id', gdController.updateGdItems);

module.exports = router;
