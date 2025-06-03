const mongoose = require('mongoose');

const quotationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  payment: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Payment'
},
  projectName: {
    type: String,
    required: [true, 'Please add a project name'],
    trim: true,
    maxlength: [100, 'Project name cannot be more than 100 characters']
  },
  description: {
    type: String,
    required: [false, 'Please add a description'],
    trim: true,
    maxlength: [500, 'Description cannot be more than 500 characters']
  },
  // Technical Information
  technicalInfo: {
    type: String,
    required: false
  },
  resolution: {
    type: String,
    required: false
  },
  deadline: {
    type: Date,
    required: false
  },
  requiredHour: {
    type: Number,
    min: [0, 'Required hours must be at least 0'],
    required: false
  },
  // Deliverables
  deliverables: {
    type: String,
    trim: false,
    maxlength: [1000, 'Deliverables cannot be more than 1000 characters']
  },
  // File attachments
  file: String,
  completedFile: {
    type: String,
    default: null
  },
  // Status
  status: {
    type: String,
    enum: ['requested', 'quoted', 'approved', 'rejected', 'ongoing', 'completed'],
    default: 'requested'
  },
    poStatus: {
    type: String,
    enum: ['requested', 'approved', 'rejected'],

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
