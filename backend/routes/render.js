const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

const { captureFramesStreaming } = require('../services/puppeteer');
const { createFFmpegStream } = require('../services/ffmpeg');
const authMiddleware = require('../middleware/auth');

// --- تحميل المكتبات محلياً لضمان السرعة القصوى ---
const loadLib = (pkgName, fileName) => {
    try {
        const libPath = require.resolve(`${pkgName}/${fileName}`);
        return fsSync.readFileSync(libPath, 'utf8');
    } catch (err) {
        console.error(`⚠️ فشل تحميل ${pkgName}:`, err.message);
        return '';
    }
};

const gsapCode = loadLib('gsap', 'dist/gsap.min.js');
const twemojiCode = loadLib('twemoji', 'dist/twemoji.min.js');
const lottieCode = loadLib('lottie-web', 'build/player/lottie.min.js');

const RESOLUTIONS = {
    'HD_Vertical': { width: 1080, height: 1920, name: 'ريلز/تيك توك' },
    'Square': { width: 1080, height: 1080, name: 'مربع' },
    'HD_Horizontal': { width: 1920, height: 1080, name: 'أفقي' }
};

const jobs = new Map();

function updateJobProgress(jobId, progress, stage, message) {
    const job = jobs.get(jobId);
    if (job) {
        job.progress = progress;
        job.stage = stage;
        job.message = message;
        job.listeners.forEach(listener => {
            try { listener.write(`data: ${JSON.stringify({ progress, stage, message })}\n\n`); } catch (e) {}
        });
    }
}
global.updateJobProgress = updateJobProgress;

// SSE Progress Endpoint
router.get('/progress/:jobId', (req, res) => {
    const { jobId } = req.params;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' });
    if (!jobs.has(jobId)) jobs.set(jobId, { progress: 0, stage: 'waiting', message: 'انتظار...', listeners: [] });
    const job = jobs.get(jobId);
    job.listeners.push(res);
    req.on('close', () => {
        const idx = job.listeners.indexOf(res);
        if (idx > -1) job.listeners.splice(idx, 1);
    });
});

// دالة لتحميل كل ملفات الأنيميشن وإنشاء كود اعتراض fetch
async function loadAllAnimations() {
    const animationsDir = path.resolve('./animations');
    const animations = {};
    
    try {
        const files = await fs.readdir(animationsDir);
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const filePath = path.join(animationsDir, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    JSON.parse(content); // التحقق من صحة JSON
                    animations[file] = content;
                    console.log(`✅ تم تحميل الأنيميشن: ${file}`);
                } catch (err) {
                    console.error(`⚠️ فشل تحميل ${file}:`, err.message);
                }
            }
        }
    } catch (err) {
        console.log('📁 مجلد animations غير موجود أو فارغ');
    }
    
    return animations;
}

// إنشاء كود JavaScript لاعتراض fetch وإرجاع البيانات المحلية
function createFetchInterceptor(animations) {
    if (Object.keys(animations).length === 0) return '';
    
    const animationsJson = {};
    for (const [filename, content] of Object.entries(animations)) {
        animationsJson[filename] = JSON.parse(content);
    }
    
    return `
    // اعتراض fetch لإرجاع بيانات الأنيميشن المحلية
    window.__embeddedAnimations = ${JSON.stringify(animationsJson)};
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
        const urlStr = typeof url === 'string' ? url : url.toString();
        const match = urlStr.match(/\\/animations\\/([^?\\/]+\\.json)/);
        if (match && window.__embeddedAnimations[match[1]]) {
            console.log('✅ تم تحميل الأنيميشن محلياً:', match[1]);
            return Promise.resolve(new Response(JSON.stringify(window.__embeddedAnimations[match[1]]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }));
        }
        return originalFetch.apply(this, arguments);
    };
    `;
}

router.post('/', async (req, res) => {
    const jobId = uuidv4();
    const { html = '', css = '', js = '', resolution = 'HD_Vertical', format = 'MP4', duration = 15, fps = 30, quality = 'high' } = req.body;

    // إرسال رد فوري للمستخدم لبدء تتبع SSE
    res.json({ success: true, jobId });
    jobs.set(jobId, { progress: 0, stage: 'starting', message: 'جاري التحضير...', listeners: [] });

    const sessionDir = path.resolve(process.env.TEMP_DIR || './temp', jobId);
    const outputDir = path.resolve(process.env.OUTPUT_DIR || './output');

    try {
        await fs.mkdir(sessionDir, { recursive: true });

        // تحميل كل ملفات الأنيميشن
        const animations = await loadAllAnimations();
        const fetchInterceptor = createFetchInterceptor(animations);

        // تنظيف الكود وحقن نظام المزامنة
        const scriptRegex = /<script\s+src=["'][^"']*gsap[^"']*["'][^>]*>\s*<\/script>/gi;
        let htmlClean = html.replace(scriptRegex, '');

        const fullHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #000; overflow: hidden; font-family: 'Open Sans', 'Segoe UI', Tahoma, 'Noto Sans Arabic', 'Noto Color Emoji', sans-serif; }
        img.emoji { height: 1em; width: 1em; vertical-align: -0.1em; }
        ${css}
    </style>
</head>
<body>
    ${htmlClean}
    <script>${gsapCode}</script>
    <script>${twemojiCode}</script>
    <script>${lottieCode}</script>
    <script>
        ${fetchInterceptor}
        // نظام التحكم بالوقت والمزامنة (GSAP + Lottie + CSS)
        window.__virtualTime = 0;
        window.__advanceTime = function(newTime) {
            window.__virtualTime = newTime;
            if (window.anim && typeof window.anim.goToAndStop === 'function') {
                window.anim.goToAndStop((newTime * ${fps}) / 1000, true);
            }
            if (typeof gsap !== 'undefined' && gsap.ticker) {
                gsap.ticker.time = newTime / 1000;
                gsap.ticker.tick();
            }
            if (document.getAnimations) {
                document.getAnimations().forEach(a => a.currentTime = newTime);
            }
        };

        window.onload = () => {
            try { ${js} } catch (e) { console.error('JS Error:', e); }
            if (typeof twemoji !== 'undefined') {
                twemoji.parse(document.body, { folder: 'svg', ext: '.svg' });
            }
        };
    </script>
</body>
</html>`;

        const htmlPath = path.join(sessionDir, 'index.html');
        await fs.writeFile(htmlPath, fullHTML, 'utf8');

        const { width, height } = RESOLUTIONS[resolution];
        const deviceScaleFactor = quality === 'high' ? 2 : 1;

        updateJobProgress(jobId, 10, 'rendering', 'بدء عملية الرندر...');

        const ffmpegStream = createFFmpegStream({
            outputDir, format, fps, width, height, duration, jobId,
            onProgress: (p) => updateJobProgress(jobId, 10 + (p * 0.85), 'streaming', `معالجة الفيديو: ${p}%`)
        });

        await captureFramesStreaming({
            htmlPath, ffmpegStdin: ffmpegStream.stdin, width, height, duration, fps, jobId, deviceScaleFactor
        });

        const outputPath = await ffmpegStream.waitForFinish();
        const fileName = path.basename(outputPath);

        updateJobProgress(jobId, 100, 'complete', JSON.stringify({
            success: true,
            downloadUrl: `/output/${fileName}`,
            fileName,
            resolution: RESOLUTIONS[resolution].name
        }));

        // تنظيف الملفات المؤقتة
        setTimeout(() => fs.rm(sessionDir, { recursive: true, force: true }), 300000);

    } catch (error) {
        console.error(`[${jobId}] Error:`, error);
        updateJobProgress(jobId, 0, 'error', error.message);
    }
});

module.exports = router;