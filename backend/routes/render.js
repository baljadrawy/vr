const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;

const { captureFrames, captureFramesStreaming } = require('../services/puppeteer');
const { createVideo, createFFmpegStream } = require('../services/ffmpeg');
const authMiddleware = require('../middleware/auth');

const RESOLUTIONS = {
  'HD_Vertical': { width: 1080, height: 1920, name: 'ريلز/تيك توك' },
  'Square': { width: 1080, height: 1080, name: 'مربع' },
  'HD_Horizontal': { width: 1920, height: 1080, name: 'أفقي' }
};

// تخزين حالة المهام
const jobs = new Map();

// دالة لتحديث حالة المهمة
function updateJobProgress(jobId, progress, stage, message) {
  const job = jobs.get(jobId);
  if (job) {
    job.progress = progress;
    job.stage = stage;
    job.message = message;
    // إرسال التحديث لجميع المستمعين
    job.listeners.forEach(listener => {
      try {
        listener.write(`data: ${JSON.stringify({ progress, stage, message })}\n\n`);
      } catch (e) {}
    });
  }
}

// تصدير الدالة للاستخدام في puppeteer و ffmpeg
global.updateJobProgress = updateJobProgress;

// حماية بسيطة (اختياري)
if (process.env.AUTH_TOKEN) {
  router.use(authMiddleware);
}

// SSE endpoint للتقدم
router.get('/progress/:jobId', (req, res) => {
  const { jobId } = req.params;
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // إنشاء المهمة إذا لم تكن موجودة
  if (!jobs.has(jobId)) {
    jobs.set(jobId, {
      progress: 0,
      stage: 'waiting',
      message: 'في انتظار البدء...',
      listeners: []
    });
  }

  const job = jobs.get(jobId);
  job.listeners.push(res);

  // إرسال الحالة الحالية
  res.write(`data: ${JSON.stringify({ progress: job.progress, stage: job.stage, message: job.message })}\n\n`);

  // إزالة المستمع عند الإغلاق
  req.on('close', () => {
    const idx = job.listeners.indexOf(res);
    if (idx > -1) job.listeners.splice(idx, 1);
    // تنظيف المهمة بعد دقيقة إذا لم يكن هناك مستمعين
    if (job.listeners.length === 0) {
      setTimeout(() => {
        if (jobs.has(jobId) && jobs.get(jobId).listeners.length === 0) {
          jobs.delete(jobId);
        }
      }, 60000);
    }
  });
});

router.post('/', async (req, res) => {
  const startTime = Date.now();
  const jobId = uuidv4();
  
  const {
    html = '',
    css = '',
    js = '',
    resolution = 'HD_Vertical',
    format = 'MP4',
    duration = 15,
    fps = 30,
    quality = 'high'
  } = req.body;

  // Validation
  if (!html || html.length > 500000) {
    return res.status(400).json({ 
      success: false, 
      error: 'كود HTML مطلوب ويجب أن يكون أقل من 500KB' 
    });
  }

  const maxDuration = parseInt(process.env.MAX_DURATION) || 60;
  if (duration < 1 || duration > maxDuration) {
    return res.status(400).json({ 
      success: false, 
      error: `المدة يجب أن تكون بين 1-${maxDuration} ثانية` 
    });
  }

  if (!RESOLUTIONS[resolution]) {
    return res.status(400).json({ 
      success: false, 
      error: 'دقة غير مدعومة' 
    });
  }

  const maxFps = parseInt(process.env.MAX_FPS) || 60;
  if (fps < 1 || fps > maxFps) {
    return res.status(400).json({ 
      success: false, 
      error: `FPS يجب أن يكون بين 1-${maxFps}` 
    });
  }

  if (!['MP4', 'GIF'].includes(format)) {
    return res.status(400).json({ 
      success: false, 
      error: 'التنسيق يجب أن يكون MP4 أو GIF' 
    });
  }

  // إنشاء المهمة
  jobs.set(jobId, {
    progress: 0,
    stage: 'starting',
    message: 'جاري التحضير...',
    listeners: []
  });

  // إرسال jobId فوراً
  res.json({ success: true, jobId });

  const sessionDir = path.resolve(process.env.TEMP_DIR || './temp', jobId);
  
  try {
    logger.info(`[${jobId}] بدء عملية جديدة - ${resolution} - ${duration}s - ${format}`);
    updateJobProgress(jobId, 5, 'preparing', 'جاري إنشاء ملف HTML...');
    
    // إنشاء مجلد الجلسة
    await fs.mkdir(sessionDir, { recursive: true });

    // 1. إنشاء ملف HTML مع دعم الخطوط العربية والإيموجي (خطوط النظام)
    const fullHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      margin: 0; 
      padding: 0; 
      overflow: hidden;
      background: #000;
      font-family: 'Noto Sans Arabic', 'Noto Sans', 'Noto Color Emoji', sans-serif;
    }
    ${css}
  </style>
</head>
<body>
  ${html}
  <script>
    ${js}
  </script>
</body>
</html>`;

    const htmlPath = path.join(sessionDir, 'index.html');
    await fs.writeFile(htmlPath, fullHTML, 'utf8');

    updateJobProgress(jobId, 10, 'capturing', 'جاري التقاط الإطارات...');

    const { width, height } = RESOLUTIONS[resolution];
    const deviceScaleFactor = quality === 'high' ? 2 : 1;
    const outputDir = process.env.OUTPUT_DIR || './output';
    
    let outputPath;

    if (format === 'MP4') {
      logger.info(`[${jobId}] 🚀 استخدام البث المباشر (Streaming) - ${duration * fps} إطار`);
      
      const ffmpegStream = createFFmpegStream({
        outputDir,
        format,
        fps,
        width,
        height,
        jobId
      });

      await captureFramesStreaming({
        htmlPath,
        ffmpegStdin: ffmpegStream.stdin,
        width,
        height,
        duration,
        fps,
        jobId,
        deviceScaleFactor,
        onProgress: (percent) => {
          const adjustedProgress = 10 + (percent * 0.85);
          updateJobProgress(jobId, Math.round(adjustedProgress), 'streaming', `البث المباشر: ${percent}%`);
        }
      });

      updateJobProgress(jobId, 95, 'finalizing', 'جاري إنهاء الفيديو...');
      outputPath = await ffmpegStream.waitForFinish();
      
    } else {
      logger.info(`[${jobId}] التقاط ${duration * fps} إطار (GIF)...`);
      
      await captureFrames({
        htmlPath,
        sessionDir,
        width,
        height,
        duration,
        fps,
        jobId,
        deviceScaleFactor,
        onProgress: (percent) => {
          const adjustedProgress = 10 + (percent * 0.7);
          updateJobProgress(jobId, Math.round(adjustedProgress), 'capturing', `التقاط الإطارات: ${percent}%`);
        }
      });

      updateJobProgress(jobId, 80, 'encoding', 'جاري ترميز GIF...');
      
      outputPath = await createVideo({
        framesDir: sessionDir,
        outputDir,
        format,
        fps,
        width,
        height,
        jobId,
        onProgress: (percent) => {
          const adjustedProgress = 80 + (percent * 0.18);
          updateJobProgress(jobId, Math.round(adjustedProgress), 'encoding', `ترميز GIF: ${percent}%`);
        }
      });
    }

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`[${jobId}] ✅ اكتمل في ${processingTime}s`);

    const fileName = path.basename(outputPath);
    const fileSize = (await fs.stat(outputPath)).size;

    // إرسال النتيجة النهائية
    updateJobProgress(jobId, 100, 'complete', JSON.stringify({
      success: true,
      downloadUrl: `/output/${fileName}`,
      fileName,
      processingTime: `${processingTime}s`,
      resolution: RESOLUTIONS[resolution].name,
      format,
      fileSize
    }));

    // تنظيف الملفات المؤقتة (بعد 5 دقائق)
    setTimeout(async () => {
      try {
        await fs.rm(sessionDir, { recursive: true, force: true });
        logger.info(`[${jobId}] تم تنظيف الملفات المؤقتة`);
      } catch (err) {
        logger.error(`[${jobId}] خطأ في التنظيف: ${err.message}`);
      }
    }, 5 * 60 * 1000);

  } catch (error) {
    logger.error(`[${jobId}] خطأ: ${error.message}`, { stack: error.stack });
    
    updateJobProgress(jobId, 0, 'error', error.message);
    
    // تنظيف عند الخطأ
    try {
      await fs.rm(sessionDir, { recursive: true, force: true });
    } catch {}
  }
});

module.exports = router;
