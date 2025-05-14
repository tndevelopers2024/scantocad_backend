require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const colors = require('colors');

// Custom modules
const connectDB = require('./config/db');
const errorHandler = require('./middleware/error');
const sanitizeInput = require('./middleware/sanitizeInput');

// Route files
const auth = require('./routes/auth');
const users = require('./routes/user');
const quotationRoutes = require('./routes/quotationRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

// Connect to MongoDB
connectDB();

const app = express();

// Body parser
app.use(express.json());

// Cookie parser
app.use(cookieParser());

// Dev logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Input sanitization (safe)
app.use(sanitizeInput);

// Set secure HTTP headers
app.use(helmet());

// Prevent HTTP parameter pollution
app.use(hpp());

// Rate limiting
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Enable CORS
app.use(cors());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Mount routers
app.use('/api/v1/auth', auth);
app.use('/api/v1/users', users);
app.use('/api/v1/quotations', quotationRoutes);
app.use('/api/v1/payments', paymentRoutes);
// Custom error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(
    `Server running in ${process.env.NODE_ENV} mode on port ${PORT}`.yellow.bold
  );
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error(`Error: ${err.message}`.red);
  server.close(() => process.exit(1));
});
