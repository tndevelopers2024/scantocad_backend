const express = require('express');
const router = express.Router();
const rateConfigController = require('../controllers/rateConfigController');
const { protect, authorize } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const RateConfig = require('../models/Config');

router
  .route('/current')
  .get(rateConfigController.getCurrentRate);

router
  .route('/')
  .get(
    protect,
    authorize('admin'),
    advancedResults(RateConfig),
    rateConfigController.getRates
  )
  .post(
    protect,
    authorize('admin'),
    rateConfigController.createRate
  );

router
  .route('/:id')
  .get(
    protect,
    authorize('admin'),
    rateConfigController.getRate
  )
  .put(
    protect,
    authorize('admin'),
    rateConfigController.updateRate
  )
  .delete(
    protect,
    authorize('admin'),
    rateConfigController.deleteRate
  );

module.exports = router;