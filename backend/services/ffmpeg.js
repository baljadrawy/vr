const { spawn } = require('child_process');
const path = require('path');

// استخدام logger المعرف عالمياً أو console
const log = global.logger || console;

/**
 * إنشاء فيديو عبر البث المباشر للصور (Streaming)
 */
function createFFmpegStream({ outputDir, format, fps, width, height, duration, jobId, onProgress }) {
    const outputFileName = `video_${jobId}_${Date.now()}.${format.toLowerCase()}`;
    const outputPath = path.join(outputDir, outputFileName);
    const totalFrames = fps * (duration || 15);

    let args;

    // فلتر لضمان أن الأبعاد زوجية (مطلب لـ H.264) ولتغيير الحجم بدقة
    const videoFilters = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2`;

    if (format === 'MP4') {
        args = [
            '-f', 'image2pipe',
            '-vcodec', 'mjpeg',
            '-framerate', fps.toString(),
            '-i', '-', // استلام الصور من stdin
            '-vcodec', 'libx264',
            '-crf', '18',          // توازن مثالي بين الجودة والحجم
            '-preset', 'fast',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-vf', videoFilters,
            '-y', outputPath
        ];
    } else {
        // إعدادات GIF عالية الجودة
        args = [
            '-f', 'image2pipe',
            '-vcodec', 'mjpeg',
            '-framerate', fps.toString(),
            '-i', '-',
            '-vf', `fps=${fps},${videoFilters},split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`,
            '-y', outputPath
        ];
    }

    const ffmpegProcess = spawn('ffmpeg', args);

    log.info(`[${jobId}] FFmpeg Stream بدء - ${format}`);

    let lastProgress = 0;
    ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();

        // استخراج عدد الإطارات المعالجة لحساب التقدم
        const match = output.match(/frame=\s*(\d+)/);
        if (match && onProgress) {
            const frameCount = parseInt(match[1]);
            const percent = Math.min(99, Math.round((frameCount / totalFrames) * 100));
            if (percent > lastProgress) {
                lastProgress = percent;
                onProgress(percent);
            }
        }
    });

    return {
        process: ffmpegProcess,
        stdin: ffmpegProcess.stdin,
        outputPath,
        outputFileName,

        waitForFinish: () => {
            return new Promise((resolve, reject) => {
                ffmpegProcess.on('close', (code) => {
                    if (code === 0) {
                        log.info(`[${jobId}] ✅ اكتمل إنشاء الفيديو: ${outputFileName}`);
                        if (onProgress) onProgress(100);
                        resolve(outputPath);
                    } else {
                        reject(new Error(`FFmpeg فشل بكود: ${code}`));
                    }
                });

                ffmpegProcess.on('error', (err) => {
                    log.error(`[${jobId}] FFmpeg خطأ: ${err.message}`);
                    reject(err);
                });
            });
        }
    };
}

/**
 * إنشاء فيديو من مجلد صور مخزن مسبقاً (الوضع التقليدي)
 */
function createVideo({ framesDir, outputDir, format, fps, width, height, duration, jobId, onProgress }) {
    // نستخدم نفس المنطق أعلاه ولكن مع تغيير الدخل إلى نمط الملفات
    // تم الإبقاء عليها لدعم التوافق مع الأنظمة القديمة في مشروعك
    const outputFileName = `video_${jobId}_${Date.now()}.${format.toLowerCase()}`;
    const outputPath = path.join(outputDir, outputFileName);
    const inputPattern = path.join(framesDir, 'frame_%05d.jpg');
    const totalFrames = fps * (duration || 15);

    const videoFilters = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2`;

    let args = [
        '-framerate', fps.toString(),
        '-i', inputPattern,
        '-y', outputPath
    ];

    if (format === 'MP4') {
        args.splice(4, 0, '-vcodec', 'libx264', '-crf', '18', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-vf', videoFilters);
    } else {
        args.splice(4, 0, '-vf', `fps=${fps},${videoFilters},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`);
    }

    return new Promise((resolve, reject) => {
        const ffmpegProcess = spawn('ffmpeg', args);
        let lastProgress = 0;

        ffmpegProcess.stderr.on('data', (data) => {
            const match = data.toString().match(/frame=\s*(\d+)/);
            if (match && onProgress) {
                const percent = Math.min(100, Math.round((parseInt(match[1]) / totalFrames) * 100));
                if (percent > lastProgress) {
                    lastProgress = percent;
                    onProgress(percent);
                }
            }
        });

        ffmpegProcess.on('close', (code) => code === 0 ? resolve(outputPath) : reject(new Error('FFmpeg Error')));
    });
}

module.exports = { createVideo, createFFmpegStream };