const RateConfig = require('../models/Config');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get current active rate
// @route   GET /api/v1/rateconfig/current
// @access  Public
exports.getCurrentRate = asyncHandler(async (req, res, next) => {
  const rate = await RateConfig.findOne({ isActive: true })
    .sort({ effectiveFrom: -1 });

  if (!rate) {
    return next(new ErrorResponse('No active rate configuration found', 404));
  }

  res.status(200).json({
    success: true,
    data: rate
  });
});

// @desc    Get all rate configurations
// @route   GET /api/v1/rateconfig
// @access  Private/Admin
exports.getRates = asyncHandler(async (req, res, next) => {
  res.status(200).json(res.advancedResults);
});

// @desc    Get single rate configuration
// @route   GET /api/v1/rateconfig/:id
// @access  Private/Admin
exports.getRate = asyncHandler(async (req, res, next) => {
  const rate = await RateConfig.findById(req.params.id);

  if (!rate) {
    return next(
      new ErrorResponse(`Rate config not found with id of ${req.params.id}`, 404)
    );
  }

  res.status(200).json({
    success: true,
    data: rate
  });
});

// @desc    Create new rate configuration
// @route   POST /api/v1/rateconfig
// @access  Private/Admin
exports.createRate = asyncHandler(async (req, res, next) => {
  // Deactivate all previous rates
  await RateConfig.updateMany({}, { isActive: false });

  const rate = await RateConfig.create(req.body);

  res.status(201).json({
    success: true,
    data: rate
  });
});

// @desc    Update rate configuration
// @route   PUT /api/v1/rateconfig/:id
// @access  Private/Admin
exports.updateRate = asyncHandler(async (req, res, next) => {
  let rate = await RateConfig.findById(req.params.id);

  if (!rate) {
    return next(
      new ErrorResponse(`Rate config not found with id of ${req.params.id}`, 404)
    );
  }

  // If making this rate active, deactivate all others
  if (req.body.isActive === true) {
    await RateConfig.updateMany(
      { _id: { $ne: req.params.id } },
      { isActive: false }
    );
  }

  rate = await RateConfig.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: rate
  });
});

// @desc    Delete rate configuration
// @route   DELETE /api/v1/rateconfig/:id
// @access  Private/Admin
exports.deleteRate = asyncHandler(async (req, res, next) => {
  const rate = await RateConfig.findById(req.params.id);

  if (!rate) {
    return next(
      new ErrorResponse(`Rate config not found with id of ${req.params.id}`, 404)
    );
  }

  // Prevent deleting the last active rate
  if (rate.isActive) {
    const activeRatesCount = await RateConfig.countDocuments({ isActive: true });
    if (activeRatesCount <= 1) {
      return next(
        new ErrorResponse('Cannot delete the last active rate configuration', 400)
      );
    }
  }

  await rate.remove();

  res.status(200).json({
    success: true,
    data: {}
  });
});