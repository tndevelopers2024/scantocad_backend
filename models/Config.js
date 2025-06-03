const mongoose = require('mongoose');

const rateConfigSchema = new mongoose.Schema({
  ratePerHour: {
    type: Number,
    required: [true, 'Please add a rate per hour'],
    min: [0, 'Rate cannot be negative']
  },
  currency: {
    type: String,
    default: 'USD',
    trim: true,
    maxlength: [3, 'Currency code cannot be more than 3 characters']
  },
  effectiveFrom: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
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

// Auto-update timestamp
rateConfigSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('RateConfig', rateConfigSchema);