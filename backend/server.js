require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const rateLimit = require('express-rate-limit');

const renderRouter = require('./routes/render');
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

// Ensure API routes always return JSON (except library files)
app.use('/api', (req, res, next) => {
  if (!req.path.startsWith('/libs/')) {
    res.setHeader('Content-Type', 'application/json');
  }
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

// تقديم مكتبة GSAP محلياً
app.get('/api/libs/gsap.js', (req, res) => {
  const gsapPath = path.join(__dirname, '../node_modules/gsap/dist/gsap.min.js');
  if (fs.existsSync(gsapPath)) {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(gsapPath);
  } else {
    res.status(404).send('// GSAP not found');
  }
});

// تقديم مكتبة Twemoji محلياً
app.get('/api/libs/twemoji.js', (req, res) => {
  const twemojiPath = path.join(__dirname, '../node_modules/twemoji/dist/twemoji.min.js');
  if (fs.existsSync(twemojiPath)) {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(twemojiPath);
  } else {
    res.status(404).send('// Twemoji not found');
  }
});

// تقديم مكتبة Lottie محلياً
app.get('/api/libs/lottie.js', (req, res) => {
  const lottiePath = path.join(__dirname, '../node_modules/lottie-web/build/player/lottie.min.js');
  if (fs.existsSync(lottiePath)) {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(lottiePath);
  } else {
    res.status(404).send('// Lottie not found');
  }
});

// تقديم الفيديوهات
app.use('/output', express.static(process.env.OUTPUT_DIR || './output'));

// مجلد الأنيميشنات
const ANIMATIONS_DIR = path.join(__dirname, '../animations');
if (!fs.existsSync(ANIMATIONS_DIR)) {
  fs.mkdirSync(ANIMATIONS_DIR, { recursive: true });
}

// تقديم ملفات الأنيميشن
app.use('/animations', express.static(ANIMATIONS_DIR));

// رفع ملف أنيميشن Lottie
app.post('/api/animations/upload', express.json({ limit: '50mb' }), (req, res) => {
  try {
    const { name, data } = req.body;
    
    if (!name || !data) {
      return res.status(400).json({ success: false, error: 'اسم الملف والبيانات مطلوبة' });
    }
    
    // تنظيف اسم الملف
    const safeName = name.replace(/[^a-zA-Z0-9_\-\.]/g, '_').replace(/\.json$/i, '') + '.json';
    const filePath = path.join(ANIMATIONS_DIR, safeName);
    
    // التحقق من أن البيانات JSON صالحة
    try {
      JSON.parse(data);
    } catch (e) {
      return res.status(400).json({ success: false, error: 'ملف JSON غير صالح' });
    }
    
    fs.writeFileSync(filePath, data);
    
    res.json({ 
      success: true, 
      filename: safeName,
      url: `/animations/${safeName}`
    });
  } catch (error) {
    logger.error('Animation upload error:', error);
    res.status(500).json({ success: false, error: 'فشل رفع الملف' });
  }
});

// قائمة الأنيميشنات المحفوظة
app.get('/api/animations/list', (req, res) => {
  try {
    const files = fs.readdirSync(ANIMATIONS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        name: f.replace('.json', ''),
        filename: f,
        url: `/animations/${f}`
      }));
    
    res.json({ success: true, animations: files });
  } catch (error) {
    logger.error('Animation list error:', error);
    res.json({ success: true, animations: [] });
  }
});

// حذف أنيميشن
app.delete('/api/animations/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const safeName = filename.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const filePath = path.join(ANIMATIONS_DIR, safeName);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: 'الملف غير موجود' });
    }
  } catch (error) {
    logger.error('Animation delete error:', error);
    res.status(500).json({ success: false, error: 'فشل حذف الملف' });
  }
});

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
