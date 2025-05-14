const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const Quotation = require('../models/Quotation');

// @desc Get all quotations
exports.getQuotations = asyncHandler(async (req, res) => {
  const quotations = await Quotation.find().populate('user', 'name email');
  res.status(200).json({ success: true, count: quotations.length, data: quotations });
});

// @desc Get single quotation
exports.getQuotation = asyncHandler(async (req, res, next) => {
  const quotation = await Quotation.findById(req.params.id).populate('user', 'name email');
  if (!quotation) return next(new ErrorResponse('Quotation not found', 404));
  res.status(200).json({ success: true, data: quotation });
});

// @desc User requests a new quotation
exports.requestQuotation = asyncHandler(async (req, res) => {
  req.body.user = req.user.id;
  const quotation = await Quotation.create(req.body);
  res.status(201).json({ success: true, data: quotation });
});

// @desc Admin raises quote (adds required hour)
exports.raiseQuote = asyncHandler(async (req, res, next) => {
  const { requiredHour } = req.body;
  const quotation = await Quotation.findById(req.params.id);
  if (!quotation) return next(new ErrorResponse('Quotation not found', 404));

  quotation.requiredHour = requiredHour;
  quotation.status = 'quoted';
  await quotation.save();

  res.status(200).json({ success: true, data: quotation });
});

// @desc User approves or rejects the quote
exports.userDecision = asyncHandler(async (req, res, next) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return next(new ErrorResponse('Invalid status', 400));
  }

  const quotation = await Quotation.findById(req.params.id);
  if (!quotation) return next(new ErrorResponse('Quotation not found', 404));

  quotation.status = status;
  await quotation.save();

  res.status(200).json({ success: true, data: quotation });
});

// @desc Admin completes the work and uploads file
exports.completeQuotation = asyncHandler(async (req, res, next) => {
  const { completedFile } = req.body;
  const quotation = await Quotation.findById(req.params.id);
  if (!quotation) return next(new ErrorResponse('Quotation not found', 404));

  quotation.completedFile = completedFile;
  quotation.status = 'completed';
  await quotation.save();

  res.status(200).json({ success: true, data: quotation });
});

// Optional: Admin update or delete quotation
exports.updateQuotation = asyncHandler(async (req, res, next) => {
  const quotation = await Quotation.findByIdAndUpdate(req.params.id, req.body, {
    new: true, runValidators: true
  });
  if (!quotation) return next(new ErrorResponse('Quotation not found', 404));
  res.status(200).json({ success: true, data: quotation });
});

exports.deleteQuotation = asyncHandler(async (req, res, next) => {
  const quotation = await Quotation.findByIdAndDelete(req.params.id);
  if (!quotation) return next(new ErrorResponse('Quotation not found', 404));
  res.status(200).json({ success: true, data: {} });
});
