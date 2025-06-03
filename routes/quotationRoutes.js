const express = require('express');
const {
  getQuotations,
  getQuotation,
  requestQuotation,
  raiseQuote,
  userDecision,
  completeQuotation,
  updateQuotation,
  deleteQuotation,
  getUserQuotations,
  markQuotationOngoing,
  getUserQuotationsById,
  updatePoStatus,
  userDecisionPO,
  updateRequiredHourAgain
} = require('../controllers/quotationController');

// Optional auth middleware
 const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Public or protected access as needed
router.route('/')
  .get(getQuotations)
  .post(protect,requestQuotation);

  router.get('/my-quotations', protect, getUserQuotations);

router.route('/user/:id')
  .get(protect,getUserQuotationsById);


router.route('/:id')
  .put(protect,updateQuotation);

  router.route('/:id/po-status')
  .put(protect,updatePoStatus);

router.route('/:id')
  .get(getQuotation)
  .delete(deleteQuotation);

router.put('/:id/quote', protect, authorize('admin'), raiseQuote);
router.put('/:id/update-hour', protect, authorize('admin'), updateRequiredHourAgain);
router.put('/:id/decision', protect, authorize('user','company'), userDecision);
router.put('/:id/decisionpo', protect, authorize('user','company'), userDecisionPO);
router.put('/:id/ongoing', protect, authorize('admin'), markQuotationOngoing);
router.put('/:id/complete', protect, authorize('admin'), completeQuotation);

module.exports = router;