const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function createFFmpegStream({ outputDir, format, fps, width, height, jobId }) {
  const outputFileName = `video_${jobId}_${Date.now()}.${format.toLowerCase()}`;
  const outputPath = path.join(outputDir, outputFileName);

  let args;
  
  if (format === 'MP4') {
    args = [
      '-f', 'image2pipe',
      '-framerate', fps.toString(),
      '-i', '-',
      '-vcodec', 'libx264',
      '-crf', '16',
      '-preset', 'fast',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-vf', `scale=${width}:${height}`,
      '-y',
      outputPath
    ];
  } else {
    args = [
      '-f', 'image2pipe',
      '-framerate', fps.toString(),
      '-i', '-',
      '-vf', `fps=${fps},scale=${width}:${height}:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`,
      '-y',
      outputPath
    ];
  }

  const ffmpegProcess = spawn('ffmpeg', args);

  logger.info(`[${jobId}] FFmpeg Stream بدء - ${format} ${width}x${height}`);

  ffmpegProcess.stderr.on('data', (data) => {
    const output = data.toString();
    if (output.includes('frame=') || output.includes('error')) {
      logger.debug(`[${jobId}] FFmpeg: ${output.substring(0, 100)}`);
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
            logger.info(`[${jobId}] ✅ FFmpeg اكتمل: ${outputFileName}`);
            resolve(outputPath);
          } else {
            reject(new Error(`FFmpeg exited with code ${code}`));
          }
        });

        ffmpegProcess.on('error', (err) => {
          logger.error(`[${jobId}] FFmpeg خطأ: ${err.message}`);
          reject(err);
        });
      });
    }
  };
}

function createVideo({ framesDir, outputDir, format, fps, width, height, jobId, onProgress }) {
  return new Promise((resolve, reject) => {
    const outputFileName = `video_${jobId}_${Date.now()}.${format.toLowerCase()}`;
    const outputPath = path.join(outputDir, outputFileName);
    const inputPattern = path.join(framesDir, 'frame_%05d.jpg');

    let args;
    
    if (format === 'MP4') {
      args = [
        '-framerate', fps.toString(),
        '-i', inputPattern,
        '-vcodec', 'libx264',
        '-crf', '16',
        '-preset', 'fast',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-y',
        outputPath
      ];
    } else {
      args = [
        '-framerate', fps.toString(),
        '-i', inputPattern,
        '-vf', `fps=${fps},scale=${width}:${height}:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`,
        '-y',
        outputPath
      ];
    }

    const ffmpegProcess = spawn('ffmpeg', args);

    logger.info(`[${jobId}] FFmpeg بدء: ${args.slice(0, 5).join(' ')}...`);

    let lastProgress = 0;

    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();
      const match = output.match(/frame=\s*(\d+)/);
      if (match && onProgress) {
        const frameCount = parseInt(match[1]);
        const totalFrames = fps * 60;
        const percent = Math.min(100, Math.round((frameCount / totalFrames) * 100));
        if (percent > lastProgress) {
          lastProgress = percent;
          onProgress(percent);
        }
      }
    });

    ffmpegProcess.on('close', (code) => {
      if (code === 0) {
        logger.info(`[${jobId}] ✅ FFmpeg اكتمل: ${outputFileName}`);
        if (onProgress) onProgress(100);
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    ffmpegProcess.on('error', (err) => {
      logger.error(`[${jobId}] FFmpeg خطأ: ${err.message}`);
      reject(new Error(`فشل الترميز: ${err.message}`));
    });
  });
}

module.exports = { createVideo, createFFmpegStream };
