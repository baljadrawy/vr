require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const rateLimit = require('express-rate-limit');

const renderRouter = require('./routes/render');
const projectsRouter = require('./routes/projects');
const { scheduleCleanup } = require('./utils/cleanup');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: path.join(process.env.LOG_DIR || './logs', 'error.log'), 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: path.join(process.env.LOG_DIR || './logs', 'combined.log') 
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

global.logger = logger;

// إنشاء المجلدات المطلوبة
const dirs = [
  process.env.TEMP_DIR || './temp',
  process.env.OUTPUT_DIR || './output',
  process.env.LOG_DIR || './logs'
];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`Created directory: ${dir}`);
  }
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGIN || '*'
    : '*'
}));

app.use(express.json({ limit: '10mb' }));

// Ensure API routes always return JSON
app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

app.use(express.static('frontend'));

// Rate Limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: process.env.RATE_LIMIT || 20,
  message: { 
    success: false, 
    error: 'كثير من الطلبات، حاول بعد قليل' 
  }
});

app.use('/api/', limiter);

// Routes
app.use('/api/render', renderRouter);
app.use('/api/projects', projectsRouter);

// تقديم الفيديوهات
app.use('/output', express.static(process.env.OUTPUT_DIR || './output'));

// الصفحة الرئيسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'المسار غير موجود' 
  });
});

// Error Handler
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`, { 
    stack: err.stack,
    url: req.url,
    method: req.method
  });
  
  res.status(500).json({ 
    success: false, 
    error: 'حدث خطأ في الخادم',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start Server
app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📁 Output: ${process.env.OUTPUT_DIR || './output'}`);
  logger.info(`🗑️  Cleanup interval: ${process.env.CLEANUP_INTERVAL || 3600000}ms`);
  logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // بدء تنظيف تلقائي
  scheduleCleanup();
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});
