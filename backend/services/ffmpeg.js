const ffmpeg = require('fluent-ffmpeg');
const path = require('path');

// تحديد مسار FFmpeg (إن لزم)
if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}

function createVideo({ framesDir, outputDir, format, fps, width, height, jobId, onProgress }) {
  return new Promise((resolve, reject) => {
    const outputFileName = `video_${jobId}_${Date.now()}.${format.toLowerCase()}`;
    const outputPath = path.join(outputDir, outputFileName);
    const inputPattern = path.join(framesDir, 'frame_%05d.jpg');

    const command = ffmpeg()
      .input(inputPattern)
      .inputFPS(fps);

    if (format === 'MP4') {
      // إعدادات MP4 عالية الجودة وسريعة
      command
        .videoCodec('libx264')
        .outputOptions([
          '-crf 16',              // جودة عالية
          '-preset fast',         // سرعة مع جودة جيدة
          '-pix_fmt yuv420p',     // توافق عالي
          '-movflags +faststart'  // للتشغيل السريع على الويب
        ]);
    } else if (format === 'GIF') {
      // إعدادات GIF محسّنة
      command
        .complexFilter([
          `fps=${fps},scale=${width}:${height}:flags=lanczos,split[s0][s1]`,
          '[s0]palettegen=max_colors=256[p]',
          '[s1][p]paletteuse=dither=bayer:bayer_scale=5'
        ]);
    }

    command
      .output(outputPath)
      .on('start', (cmd) => {
        logger.info(`[${jobId}] FFmpeg بدء: ${cmd.substring(0, 100)}...`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          const percent = Math.round(progress.percent);
          if (onProgress) {
            onProgress(percent);
          }
          if (percent % 10 === 0) {
            logger.info(`[${jobId}] الترميز: ${percent}%`);
          }
        }
      })
      .on('end', () => {
        logger.info(`[${jobId}] ✅ FFmpeg اكتمل: ${outputFileName}`);
        if (onProgress) onProgress(100);
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error(`[${jobId}] FFmpeg خطأ: ${err.message}`);
        reject(new Error(`فشل الترميز: ${err.message}`));
      })
      .run();
  });
}

module.exports = { createVideo };
