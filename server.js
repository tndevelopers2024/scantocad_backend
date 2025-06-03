require('dotenv').config();
const express = require('express');
const http = require('http'); // 👈 Required for WebSocket
const fileUpload = require('express-fileupload');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const colors = require('colors');
const { Server } = require('socket.io'); // 👈 Socket.IO import

// Custom modules
const connectDB = require('./config/db');
const errorHandler = require('./middleware/error');
const sanitizeInput = require('./middleware/sanitizeInput');

// Route files
const auth = require('./routes/auth');
const users = require('./routes/user');
const quotationRoutes = require('./routes/quotationRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
 const rateConfigRoutes = require('./routes/rateConfig');
// Connect to MongoDB
connectDB();

// Init express app
const app = express();

// Create HTTP server for WebSocket
const httpServer = http.createServer(app);

// Initialize Socket.IO server
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Or specify frontend origin
    methods: ['GET', 'POST']
  }
});

// Make io available to the whole app
app.set('io', io);

// Handle WebSocket connections
io.on('connection', (socket) => {
  console.log(`🟢 Socket connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`🔴 Socket disconnected: ${socket.id}`);
  });
});

// Middleware stack
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(cookieParser());
app.use(fileUpload());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use(sanitizeInput);
app.use(helmet());
app.use(hpp());

// Rate limiter
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 100
});
app.use(limiter);

// Static folders
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/completed_files', express.static(path.join(__dirname, 'completed_files')));
app.use('/uploads/purchase_orders', express.static(path.join(__dirname, 'purchase_orders')));

// Routes
app.use('/api/v1/auth', auth);
app.use('/api/v1/users', users);
app.use('/api/v1/quotations', quotationRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/rateconfig', rateConfigRoutes);

// Error handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV} on port ${PORT}`.yellow.bold);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error(`❌ Error: ${err.message}`.red);
  httpServer.close(() => process.exit(1));
});
