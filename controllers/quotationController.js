const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const path = require('path');
const fs = require('fs');
const Quotation = require('../models/Quotation');
const User = require('../models/User');
const Notification = require('../models/Notification');


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
exports.requestQuotation = asyncHandler(async (req, res, next) => {
  let file;
  let filePath;

  try {
    // Validate request body
    const { projectName, description,deliverables, technicalInfo  } = req.body;
    if (!projectName || !description) {
      return next(new ErrorResponse('Please provide project name and description', 400));
    }

    // Check if file exists
    if (!req.files || !req.files.file) {
      return next(new ErrorResponse('No 3D model file was uploaded', 400));
    }

    file = req.files.file;

    // File validation configuration
    const maxSize = 50 * 1024 * 1024; // Increased to 50MB for 3D models
    const allowedExtensions = ['.stl', '.obj', '.ply', '.3mf'];
    const fileExtension = path.extname(file.name).toLowerCase();

    // Validate file size
    if (file.size > maxSize) {
      return next(new ErrorResponse(`3D model file exceeds ${maxSize/1024/1024}MB limit`, 400));
    }

    // Validate file type
    if (!allowedExtensions.includes(fileExtension)) {
      return next(new ErrorResponse(
        'Invalid file type. Only 3D model files (STL, OBJ, PLY, 3MF) are accepted',
        400
      ));
    }

    // Create uploads directory structure with date-based organization
    const now = new Date();
    const uploadDir = path.join(
      __dirname, 
      '../uploads',
      `${now.getFullYear()}`,
      `${now.getMonth() + 1}`,
      `${now.getDate()}`
    );

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Generate sanitized filename
    const originalName = path.parse(file.name).name;
    const sanitizedName = originalName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `${sanitizedName}_${Date.now()}${fileExtension}`;
    filePath = path.join(uploadDir, fileName);
    const relativePath = `/uploads/${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}/${fileName}`;

    // Move file with error handling
    await file.mv(filePath);

    // Create quotation
    const quotation = await Quotation.create({
      user: req.user.id,
      projectName,
      description,
      technicalInfo,
      deliverables,
      file: relativePath,
      fileType: fileExtension.substring(1).toUpperCase(), // Store file type (STL, OBJ, etc)
      fileSize: file.size // Store file size in bytes
    });

    const io = req.app.get('io'); // Get socket instance
    io.emit('quotation:requested', {
      user: req.user.id,
      projectName,
      quotationId: quotation._id,
      message: `Quotation requested for ${projectName}`
    });
    
    
    res.status(201).json({
      success: true,
      data: quotation
    });

  } catch (err) {
    console.error('Error in requestQuotation:', err);
    
    // Clean up file if upload failed
    if (file && filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    return next(new ErrorResponse('Failed to process 3D model quotation request', 500));
  }
});

// @desc Admin raises quote (adds required hour)
exports.raiseQuote = asyncHandler(async (req, res, next) => {
  const { requiredHour } = req.body;
  const quotation = await Quotation.findById(req.params.id);
  if (!quotation) return next(new ErrorResponse('Quotation not found', 404));

  quotation.requiredHour = requiredHour;
  quotation.status = 'quoted';
  await quotation.save();
  const io = req.app.get('io');
  io.emit('quotation:raised', {
    user: quotation.user,
    quotationId: quotation._id,
    requiredHour,
    message: `Quote raised for project ${quotation.projectName}`
  });
  
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

  if (status === 'approved' && quotation.requiredHour) {
    const user = await User.findById(req.user.id);
    if (!user) return next(new ErrorResponse('User not found', 404));

    if (user.Hours < quotation.requiredHour) {
      return next(new ErrorResponse(`Not enough hours. You have ${user.Hours} hours but need ${quotation.requiredHour}`, 400));
    }

    user.Hours -= quotation.requiredHour;
    await user.save();

    quotation.approvedAt = Date.now();
  }

  // Update quotation status
  quotation.status = status;
  await quotation.save();

  // Dynamic notification
  const io = req.app.get('io');
  io.emit('quotation:decision', {
    user: quotation.user,
    quotationId: quotation._id,
    status,
    message: `Quotation ${status} for project ${quotation.projectName}`
  });
  

  await Notification.create(notificationData);

  res.status(200).json({
    success: true,
    data: quotation,
    title: notificationData.title,
    message: status === 'approved' 
      ? 'Quotation approved and hours deducted' 
      : 'Quotation rejected',
  });
});


// @desc Mark quotation as ongoing
exports.markQuotationOngoing = asyncHandler(async (req, res, next) => {
  const quotation = await Quotation.findById(req.params.id);

  if (!quotation) {
    return next(new ErrorResponse('Quotation not found', 404));
  }

  // Only allow status change if it was approved
  if (quotation.status !== 'approved') {
    return next(new ErrorResponse('Quotation must be approved before it can be marked as ongoing', 400));
  }

  quotation.status = 'ongoing';
  quotation.startedAt = Date.now(); // optional timestamp if needed
  await quotation.save();
  const io = req.app.get('io');
  io.emit('quotation:ongoing', {
    user: quotation.user,
    quotationId: quotation._id,
    message: `Work started on project ${quotation.projectName}`
  });
  
  
  res.status(200).json({
    success: true,
    data: quotation,
   title:'',
    message: 'Quotation marked as ongoing',
  });
});


// @desc Admin completes the work and uploads file
// @desc Admin completes the work and uploads file
exports.completeQuotation = asyncHandler(async (req, res, next) => {
  let file;
  let filePath;

  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) return next(new ErrorResponse('Quotation not found', 404));

    // Check if file exists
    if (!req.files || !req.files.completedFile) {
      return next(new ErrorResponse('No completed file was uploaded', 400));
    }

    file = req.files.completedFile;

    // File validation configuration
    const maxSize = 50 * 1024 * 1024; // 50MB limit
    const allowedExtensions = ['.stl', '.obj', '.ply', '.3mf', '.zip', '.rar'];
    const fileExtension = path.extname(file.name).toLowerCase();

    // Validate file size
    if (file.size > maxSize) {
      return next(new ErrorResponse(`File exceeds ${maxSize/1024/1024}MB limit`, 400));
    }

    // Validate file type
    if (!allowedExtensions.includes(fileExtension)) {
      return next(new ErrorResponse(
        'Invalid file type. Only 3D model files (STL, OBJ, PLY, 3MF) or archives (ZIP, RAR) are accepted',
        400
      ));
    }

    // Create completed files directory structure with date-based organization
    const now = new Date();
    const uploadDir = path.join(
      __dirname, 
      '../completed_files',
      `${now.getFullYear()}`,
      `${now.getMonth() + 1}`,
      `${now.getDate()}`
    );

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Generate sanitized filename
    const originalName = path.parse(file.name).name;
    const sanitizedName = originalName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `completed_${sanitizedName}_${Date.now()}${fileExtension}`;
    filePath = path.join(uploadDir, fileName);
    const relativePath = `/completed_files/${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}/${fileName}`;

    // Move file with error handling
    await file.mv(filePath);

    // Update quotation
    quotation.completedFile = relativePath;
    quotation.completedFileType = fileExtension.substring(1).toUpperCase();
    quotation.completedFileSize = file.size;
    quotation.status = 'completed';
    quotation.completedAt = Date.now();
    await quotation.save();
    const io = req.app.get('io');
io.emit('quotation:completed', {
  user: quotation.user,
  quotationId: quotation._id,
  message: `Quotation completed for ${quotation.projectName}`
});

    res.status(200).json({ 
      success: true, 
      data: quotation 
    });

  } catch (err) {
    console.error('Error in completeQuotation:', err);
    
    // Clean up file if upload failed
    if (file && filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    return next(new ErrorResponse('Failed to process completed quotation', 500));
  }
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

// @desc    Get all quotations for current user
exports.getUserQuotations = asyncHandler(async (req, res) => {
  const quotations = await Quotation.find({ user: req.user.id }).populate('user', 'name email');
  res.status(200).json({ 
    success: true, 
    count: quotations.length, 
    data: quotations 
  });
});
