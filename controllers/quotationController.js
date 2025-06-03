const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const path = require('path');
const fs = require('fs');
const Quotation = require('../models/Quotation');
const User = require('../models/User');
const Notification = require('../models/Notification');
const sendEmail = require('../utils/sendEmail');

// Helper function to load email template
const loadEmailTemplate = async (templateName, replacements) => {
  try {
    const templatePath = path.join(__dirname, `../emailTemplates/${templateName}`);
    let template = await fs.promises.readFile(templatePath, 'utf8');
    
    // Replace placeholders with actual values
    for (const [key, value] of Object.entries(replacements)) {
      template = template.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    
    return template;
  } catch (err) {
    console.error(`Error loading email template ${templateName}:`, err);
    throw new Error('Failed to load email template');
  }
};

// Helper function to send email notifications
const sendQuotationEmail = async (email, subject, templateName, replacements) => {
  try {
    const message = await loadEmailTemplate(templateName, replacements);
    await sendEmail({
      email,
      subject,
      message
    });
  } catch (err) {
    console.error('Email sending failed:', err);
  }
};

// @desc Get all quotations
exports.getQuotations = asyncHandler(async (req, res) => {
  const quotations = await Quotation.find().populate('user', 'name email phone');
  res.status(200).json({ success: true, count: quotations.length, data: quotations });
});

// @desc Get single quotation
exports.getQuotation = asyncHandler(async (req, res, next) => {
  const quotation = await Quotation.findById(req.params.id).populate('user', 'name email phone').populate('payment', 'hoursPurchased purchaseOrderFile');
  if (!quotation) return next(new ErrorResponse('Quotation not found', 404));
  res.status(200).json({ success: true, data: quotation });
});

// @desc User requests a new quotation
exports.requestQuotation = asyncHandler(async (req, res, next) => {
  let file;
  let filePath;

  try {
    // Validate request body
    const { projectName, description, deliverables, technicalInfo } = req.body;
    if (!projectName || !description) {
      return next(new ErrorResponse('Please provide project name and description', 400));
    }

    // Check if file exists
    if (!req.files || !req.files.file) {
      return next(new ErrorResponse('No 3D model file was uploaded', 400));
    }

    file = req.files.file;

    // File validation configuration
   const maxSize = 1 * 1024 * 1024 * 1024; // 1GB limit\
    const allowedExtensions = ['.stl', '.obj', '.ply', '.3mf'];
    const fileExtension = path.extname(file.name).toLowerCase();

   // Validate file extension
if (!allowedExtensions.includes(fileExtension)) {
  return next(new ErrorResponse(`Invalid file type. Allowed types: ${allowedExtensions.join(', ')}`, 400));
}

// Validate file size
if (file.size > maxSize) {
  const maxSizeInMB = maxSize / (1024 * 1024);
  return next(new ErrorResponse(`File exceeds ${maxSizeInMB}MB limit`, 400));
}

    // Validate file type
    if (!allowedExtensions.includes(fileExtension)) {
      return next(new ErrorResponse(
        'Invalid file type. Only 3D model files (STL, OBJ, PLY, 3MF) are accepted',
        400
      ));
    }

    // Create uploads directory structure
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

    // Move file
    await file.mv(filePath);

    // Create quotation
    const quotation = await Quotation.create({
      user: req.user.id,
      projectName,
      description,
      technicalInfo,
      deliverables,
      file: relativePath,
      fileType: fileExtension.substring(1).toUpperCase(),
      fileSize: file.size
    });

    // Get admin users to notify
    const adminUsers = await User.find({ role: 'admin' }).select('email');
    
    // Create admin notification
    await Notification.create({
      user: req.user.id,
      title: 'New Quotation Request',
      message: `New quotation requested for project: ${projectName}`,
      type: 'quote_requested',
      quotation: quotation._id
    });

    // Email to admins
    const adminEmails = adminUsers.map(user => user.email);
    const adminEmailSubject = `New Quotation Request: ${projectName}`;
    
    await sendQuotationEmail(
      adminEmails,
      adminEmailSubject,
      'quotationRequestedToAdmin.html',
      {
        userName: req.user.name,
        userEmail: req.user.email,
        projectName,
        description,
        date: new Date().toLocaleDateString()
      }
    );

    // Email to user
    const userEmailSubject = `Quotation Request Received: ${projectName}`;
    
    await sendQuotationEmail(
      req.user.email,
      userEmailSubject,
      'quotationRequestedToUser.html',
      {
        userName: req.user.name,
        projectName,
        supportEmail: 'support@yourcompany.com'
      }
    );

    // Socket.io notification
    const io = req.app.get('io');
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

  // Get user details for email
  const user = await User.findById(quotation.user);
  if (!user) return next(new ErrorResponse('User not found', 404));

  // Email to user
  const emailSubject = `Your Quote is Ready: ${quotation.projectName}`;
  
  await sendQuotationEmail(
    user.email,
    emailSubject,
    'quoteRaisedToUser.html',
    {
      userName: user.name,
      projectName: quotation.projectName,
      requiredHour,
      projectLink: `${process.env.FRONTEND_URL}/quotations/${quotation._id}`
    }
  );

  // Socket.io notification
  const io = req.app.get('io');
  io.emit('quotation:raised', {
    user: quotation.user,
    quotationId: quotation._id,
    requiredHour,
    message: `Quote raised for project ${quotation.projectName}`
  });
  
  res.status(200).json({ success: true, data: quotation });
});

exports.updateRequiredHourAgain = asyncHandler(async (req, res, next) => {
  const { requiredHour } = req.body;

  const quotation = await Quotation.findById(req.params.id);
  if (!quotation) return next(new ErrorResponse('Quotation not found', 404));

  // Update only the requiredHour
  quotation.requiredHour = requiredHour;
  await quotation.save();

  // Fetch user for email
  const user = await User.findById(quotation.user);
  if (!user) return next(new ErrorResponse('User not found', 404));

  // Send email to user about updated hours
  const emailSubject = `Updated Quote Hours: ${quotation.projectName}`;

  await sendQuotationEmail(
    user.email,
    emailSubject,
    'quoteHourUpdated.html', // Use a different template if needed
    {
      userName: user.name,
      projectName: quotation.projectName,
      requiredHour,
      projectLink: `${process.env.FRONTEND_URL}/quotations/${quotation._id}`
    }
  );

  // Emit socket event for real-time notification (optional)
  const io = req.app.get('io');
  io.emit('quotation:hour-updated', {
    user: quotation.user,
    quotationId: quotation._id,
    requiredHour,
    message: `Quote hours updated again for project ${quotation.projectName}`
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

  // Get admin users to notify
  const adminUsers = await User.find({ role: 'admin' }).select('email');
  const adminEmails = adminUsers.map(user => user.email);

  if (status === 'approved') {
    // Email to user
    await sendQuotationEmail(
      req.user.email,
      `Quotation Approved: ${quotation.projectName}`,
      'quoteApprovedToUser.html',
      {
        userName: req.user.name,
        projectName: quotation.projectName,
        requiredHour: quotation.requiredHour,
        supportEmail: 'support@yourcompany.com'
      }
    );

    // Email to admins
    await sendQuotationEmail(
      adminEmails,
      `Quotation Approved: ${quotation.projectName}`,
      'quoteApprovedToAdmin.html',
      {
        userName: req.user.name,
        userEmail: req.user.email,
        projectName: quotation.projectName,
        requiredHour: quotation.requiredHour,
        date: new Date().toLocaleDateString()
      }
    );
  } else {
    // Email to user
    await sendQuotationEmail(
      req.user.email,
      `Quotation Rejected: ${quotation.projectName}`,
      'quoteRejectedToUser.html',
      {
        userName: req.user.name,
        projectName: quotation.projectName,
        supportEmail: 'support@yourcompany.com'
      }
    );

    // Email to admins
    await sendQuotationEmail(
      adminEmails,
      `Quotation Rejected: ${quotation.projectName}`,
      'quoteRejectedToAdmin.html',
      {
        userName: req.user.name,
        userEmail: req.user.email,
        projectName: quotation.projectName,
        date: new Date().toLocaleDateString()
      }
    );
  }

  // Create appropriate notification
  await Notification.create({
    user: req.user.id,
    title: `Quotation ${status.charAt(0).toUpperCase() + status.slice(1)}`,
    message: `Your quotation "${quotation.projectName}" has been ${status}`,
    type: status === 'approved' ? 'quote_approved' : 'quote_rejected',
    quotation: quotation._id
  });

  // Socket.io notification
  const io = req.app.get('io');
  io.emit('quotation:decision', {
    user: quotation.user,
    quotationId: quotation._id,
    status,
    message: `Quotation ${status} for project ${quotation.projectName}`
  });

  res.status(200).json({
    success: true,
    data: quotation,
    message: status === 'approved' 
      ? 'Quotation approved and hours deducted' 
      : 'Quotation rejected',
  });
});

// @desc User changes status of the quote without hour checks
exports.userDecisionPO = asyncHandler(async (req, res, next) => {
  const { status } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return next(new ErrorResponse('Invalid status', 400));
  }

  const quotation = await Quotation.findById(req.params.id);
  if (!quotation) return next(new ErrorResponse('Quotation not found', 404));

  quotation.status = status;

  if (status === 'approved') {
    quotation.approvedAt = Date.now();
  }

  await quotation.save();

  // Get admin users to notify
  const adminUsers = await User.find({ role: 'admin' }).select('email');
  const adminEmails = adminUsers.map(user => user.email);

  // Email to user
  await sendQuotationEmail(
    req.user.email,
    `Quotation ${status === 'approved' ? 'Approved' : 'Rejected'}: ${quotation.projectName}`,
    status === 'approved' ? 'quoteApprovedToUser.html' : 'quoteRejectedToUser.html',
    {
      userName: req.user.name,
      projectName: quotation.projectName,
      requiredHour: quotation.requiredHour,
      supportEmail: 'support@yourcompany.com'
    }
  );

  // Email to admins
  await sendQuotationEmail(
    adminEmails,
    `Quotation ${status === 'approved' ? 'Approved' : 'Rejected'}: ${quotation.projectName}`,
    status === 'approved' ? 'quoteApprovedToAdmin.html' : 'quoteRejectedToAdmin.html',
    {
      userName: req.user.name,
      userEmail: req.user.email,
      projectName: quotation.projectName,
      requiredHour: quotation.requiredHour,
      date: new Date().toLocaleDateString()
    }
  );

  // Create notification
  await Notification.create({
    user: req.user.id,
    title: `Quotation ${status.charAt(0).toUpperCase() + status.slice(1)}`,
    message: `Your quotation "${quotation.projectName}" has been ${status}`,
    type: status === 'approved' ? 'quote_approved' : 'quote_rejected',
    quotation: quotation._id
  });

  // Emit socket event
  const io = req.app.get('io');
  io.emit('quotation:decision', {
    user: quotation.user,
    quotationId: quotation._id,
    status,
    message: `Quotation ${status} for project ${quotation.projectName}`
  });

  res.status(200).json({
    success: true,
    data: quotation,
    message: `Quotation ${status}`
  });
});


// @desc Mark quotation as ongoing
exports.markQuotationOngoing = asyncHandler(async (req, res, next) => {
  const quotation = await Quotation.findById(req.params.id);

  if (!quotation) {
    return next(new ErrorResponse('Quotation not found', 404));
  }

  if (quotation.status !== 'approved') {
    return next(new ErrorResponse('Quotation must be approved before it can be marked as ongoing', 400));
  }

  quotation.status = 'ongoing';
  quotation.startedAt = Date.now();
  await quotation.save();

  // Get user details for email
  const user = await User.findById(quotation.user);
  if (!user) return next(new ErrorResponse('User not found', 404));

  // Email to user
  await sendQuotationEmail(
    user.email,
    `Work Started: ${quotation.projectName}`,
    'workStartedToUser.html',
    {
      userName: user.name,
      projectName: quotation.projectName,
      expectedCompletion: 'within the agreed timeframe',
      supportEmail: 'support@yourcompany.com'
    }
  );

  // Create user notification
  await Notification.create({
    user: quotation.user,
    title: 'Work Started',
    message: `Work has started on your project "${quotation.projectName}"`,
    type: 'quote_ongoing',
    quotation: quotation._id
  });

  // Socket.io notification
  const io = req.app.get('io');
  io.emit('quotation:ongoing', {
    user: quotation.user,
    quotationId: quotation._id,
    message: `Work started on project ${quotation.projectName}`
  });
  
  res.status(200).json({
    success: true,
    data: quotation,
    message: 'Quotation marked as ongoing',
  });
});

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
   const maxSize = 1 * 1024 * 1024 * 1024; // 1GB limit
    const allowedExtensions = ['.stl', '.obj', '.ply', '.3mf', '.zip', '.rar'];
    const fileExtension = path.extname(file.name).toLowerCase();

   // Validate file extension
if (!allowedExtensions.includes(fileExtension)) {
  return next(new ErrorResponse(`Invalid file type. Allowed types: ${allowedExtensions.join(', ')}`, 400));
}

// Validate file size
if (file.size > maxSize) {
  const maxSizeInMB = maxSize / (1024 * 1024);
  return next(new ErrorResponse(`File exceeds ${maxSizeInMB}MB limit`, 400));
}
    // Validate file type
    if (!allowedExtensions.includes(fileExtension)) {
      return next(new ErrorResponse(
        'Invalid file type. Only 3D model files (STL, OBJ, PLY, 3MF) or archives (ZIP, RAR) are accepted',
        400
      ));
    }

    // Create completed files directory
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

    // Move file
    await file.mv(filePath);

    // Update quotation
    quotation.completedFile = relativePath;
    quotation.completedFileType = fileExtension.substring(1).toUpperCase();
    quotation.completedFileSize = file.size;
    quotation.status = 'completed';
    quotation.completedAt = Date.now();
    await quotation.save();

    // Get user details for email
    const user = await User.findById(quotation.user);
    if (!user) return next(new ErrorResponse('User not found', 404));

    // Email to user
    await sendQuotationEmail(
      user.email,
      `Project Completed: ${quotation.projectName}`,
      'projectCompletedToUser.html',
      {
        userName: user.name,
        projectName: quotation.projectName,
        downloadLink: `${process.env.FRONTEND_URL}/quotations/${quotation._id}`,
        supportEmail: 'support@yourcompany.com'
      }
    );
    
    // Create user notification
    await Notification.create({
      user: quotation.user,
      title: 'Project Completed',
      message: `Your project "${quotation.projectName}" has been completed`,
      type: 'quote_completed',
      quotation: quotation._id
    });

    // Socket.io notification
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

// @desc User updates their quotation request
// @route PUT /api/quotations/:id
// @access Private (user)
exports.updateQuotation = asyncHandler(async (req, res, next) => {
  const quotation = await Quotation.findById(req.params.id);

  if (!quotation) return next(new ErrorResponse('Quotation not found', 404));

  // Check ownership
  if (quotation.user.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to update this quotation', 403));
  }

  const { projectName, description, technicalInfo, deliverables } = req.body;

  // Update basic fields
  if (projectName) quotation.projectName = projectName;
  if (description) quotation.description = description;
  if (technicalInfo) quotation.technicalInfo = technicalInfo;
  if (deliverables) quotation.deliverables = deliverables;

  let newFilePath;

  // Optional file replacement
  if (req.files && req.files.file) {
    const file = req.files.file;
    const fileExtension = path.extname(file.name).toLowerCase();
    const allowedExtensions = ['.stl', '.obj', '.ply', '.3mf'];
    const maxSize = 1 * 1024 * 1024 * 1024; // 1GB

    if (!allowedExtensions.includes(fileExtension)) {
      return next(
        new ErrorResponse(`Invalid file type. Allowed: ${allowedExtensions.join(', ')}`, 400)
      );
    }

    if (file.size > maxSize) {
      return next(
        new ErrorResponse(`File exceeds ${maxSize / (1024 * 1024)}MB limit`, 400)
      );
    }

    // Create upload path
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

    const sanitizedName = path.parse(file.name).name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `${sanitizedName}_${Date.now()}${fileExtension}`;
    newFilePath = path.join(uploadDir, fileName);
    const relativePath = `/uploads/${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}/${fileName}`;

    // Delete old file if it exists
    if (quotation.file && fs.existsSync(path.join(__dirname, `..${quotation.file}`))) {
      fs.unlinkSync(path.join(__dirname, `..${quotation.file}`));
    }

    await file.mv(newFilePath);

    quotation.file = relativePath;
    quotation.fileType = fileExtension.substring(1).toUpperCase();
    quotation.fileSize = file.size;
  }

  await quotation.save();

  // Emit socket update
  const io = req.app.get('io');
  io.emit('quotation:userUpdated', {
    user: quotation.user,
    quotationId: quotation._id,
    projectName: quotation.projectName,
    message: `User updated quotation for ${quotation.projectName}`
  });

  res.status(200).json({
    success: true,
    data: quotation
  });
});


// @desc Delete quotation
exports.deleteQuotation = asyncHandler(async (req, res, next) => {
  const quotation = await Quotation.findByIdAndDelete(req.params.id);
  if (!quotation) return next(new ErrorResponse('Quotation not found', 404));
  res.status(200).json({ success: true, data: {} });
});

// @desc Get all quotations for current user
exports.getUserQuotations = asyncHandler(async (req, res) => {
  const quotations = await Quotation.find({ user: req.user.id }).populate('user', 'name email phone').populate('payment', 'hoursPurchased purchaseOrderFile');
  res.status(200).json({ 
    success: true, 
    count: quotations.length, 
    data: quotations 
  });
});

// @desc Get all quotations for a user by user ID (from params)
exports.getUserQuotationsById = asyncHandler(async (req, res) => {
  const quotations = await Quotation.find({ user: req.params.id }).populate('user', 'name email phone');

  res.status(200).json({ 
    success: true, 
    count: quotations.length, 
    data: quotations 
  });
});

exports.updatePoStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { poStatus } = req.body;

    // Validate input
    if (!poStatus) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a PO status'
      });
    }

    // Check if the status is valid
    const validStatuses = ['requested', 'approved', 'rejected', 'pending'];
    if (!validStatuses.includes(poStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid PO status'
      });
    }

    // Find and update the quotation
    const quotation = await Quotation.findByIdAndUpdate(
      id,
      { 
        poStatus: poStatus,
        updatedAt: Date.now() 
      },
      { new: true, runValidators: true }
    );

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found'
      });
    }

    res.status(200).json({
      success: true,
      data: quotation
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};