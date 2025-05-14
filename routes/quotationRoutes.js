const express = require('express');
const {
  getQuotations,
  getQuotation,
  requestQuotation,
  raiseQuote,
  userDecision,
  completeQuotation,
  updateQuotation,
  deleteQuotation
} = require('../controllers/quotationController');

// Optional auth middleware
 const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Public or protected access as needed
router.route('/')
  .get(getQuotations)
  .post(protect,requestQuotation);

router.route('/:id')
  .get(getQuotation)
  .put(updateQuotation)
  .delete(deleteQuotation);

router.put('/:id/quote', protect, authorize('admin'), raiseQuote);
router.put('/:id/decision', protect, authorize('user'), userDecision);
router.put('/:id/complete', protect, authorize('admin'), completeQuotation);

module.exports = router;
