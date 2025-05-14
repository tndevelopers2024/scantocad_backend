const mongoose = require('mongoose');

const quotationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  projectName: {
    type: String,
    required: [true, 'Please add a project name'],
    trim: true,
    maxlength: [100, 'Project name cannot be more than 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Please add a description'],
    trim: true,
    maxlength: [500, 'Description cannot be more than 500 characters']
  },
  // Technical Information
  dimensions: {
    length: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true }
  },
  scanType: {
    type: String,
    enum: ['laser', 'photogrammetry', 'structured-light', 'other'],
    required: true
  },
  resolution: {
    type: String,
    required: true
  },
  deadline: {
    type: Date,
    required: true
  },
  requiredHour: {
    type: Number,
    min: [0, 'Required hours must be at least 0'],
    required: false
  },
  // Deliverables
  deliverables: {
    type: String,
    trim: true,
    maxlength: [1000, 'Deliverables cannot be more than 1000 characters']
  },
  // File attachments
  files: [String],
  completedFile: {
    type: String,
    default: null
  },
  // Status
  status: {
    type: String,
    enum: ['requested', 'quoted', 'approved', 'rejected', 'completed'],
    default: 'requested'
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot be more than 1000 characters']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
quotationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Quotation', quotationSchema);
