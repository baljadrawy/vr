const puppeteer = require('puppeteer');
const path = require('path');

async function captureFramesStreaming({ htmlPath, ffmpegStdin, width, height, duration, fps, jobId, deviceScaleFactor = 1, onProgress }) {
  const totalFrames = duration * fps;
  const frameInterval = 1000 / fps;
  
  let browser;
  
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.CHROMIUM_PATH || '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-web-security',
        '--font-render-hinting=none',
        '--disable-font-subpixel-positioning',
        '--window-size=' + width + ',' + height
      ],
      defaultViewport: {
        width,
        height,
        deviceScaleFactor
      }
    });

    const page = await browser.newPage();
    
    await page.setViewport({ 
      width, 
      height,
      deviceScaleFactor
    });

    await page.evaluateOnNewDocument((frameIntervalMs) => {
      window.__virtualTime = 0;
      window.__timers = [];
      window.__timerIdCounter = 1;
      window.__rafCallbacks = [];
      window.__rafIdCounter = 1;

      const originalSetTimeout = window.setTimeout;
      const originalSetInterval = window.setInterval;
      const originalClearTimeout = window.clearTimeout;
      const originalClearInterval = window.clearInterval;
      const originalDateNow = Date.now;
      const originalPerfNow = performance.now.bind(performance);
      const originalRAF = window.requestAnimationFrame;
      const originalCAF = window.cancelAnimationFrame;

      Date.now = function() {
        return window.__virtualTime;
      };

      performance.now = function() {
        return window.__virtualTime;
      };

      window.setTimeout = function(callback, delay = 0, ...args) {
        const id = window.__timerIdCounter++;
        const executeAt = window.__virtualTime + delay;
        window.__timers.push({
          id,
          callback,
          args,
          executeAt,
          type: 'timeout'
        });
        return id;
      };

      window.setInterval = function(callback, delay = 0, ...args) {
        const id = window.__timerIdCounter++;
        const executeAt = window.__virtualTime + delay;
        window.__timers.push({
          id,
          callback,
          args,
          executeAt,
          delay,
          type: 'interval'
        });
        return id;
      };

      window.clearTimeout = function(id) {
        window.__timers = window.__timers.filter(t => t.id !== id);
      };

      window.clearInterval = function(id) {
        window.__timers = window.__timers.filter(t => t.id !== id);
      };

      window.requestAnimationFrame = function(callback) {
        const id = window.__rafIdCounter++;
        window.__rafCallbacks.push({ id, callback });
        return id;
      };

      window.cancelAnimationFrame = function(id) {
        window.__rafCallbacks = window.__rafCallbacks.filter(r => r.id !== id);
      };

      window.__advanceTime = function(newTime) {
        const oldTime = window.__virtualTime;
        window.__virtualTime = newTime;

        const rafCallbacks = [...window.__rafCallbacks];
        window.__rafCallbacks = [];
        rafCallbacks.forEach(({ callback }) => {
          try {
            callback(window.__virtualTime);
          } catch (e) {
            console.error('RAF callback error:', e);
          }
        });

        const timersToExecute = window.__timers.filter(t => t.executeAt <= newTime);
        window.__timers = window.__timers.filter(t => t.executeAt > newTime);

        timersToExecute.forEach(timer => {
          if (timer.type === 'interval') {
            window.__timers.push({
              ...timer,
              executeAt: timer.executeAt + timer.delay
            });
          }
        });

        timersToExecute.sort((a, b) => a.executeAt - b.executeAt);

        timersToExecute.forEach(timer => {
          try {
            timer.callback(...timer.args);
          } catch (e) {
            console.error('Timer callback error:', e);
          }
        });

        document.querySelectorAll('*').forEach(el => {
          const computed = getComputedStyle(el);
          if (computed.animationName && computed.animationName !== 'none') {
            el.style.animationDelay = `-${newTime}ms`;
            el.style.animationPlayState = 'paused';
          }
        });

        document.getAnimations().forEach(animation => {
          animation.currentTime = newTime;
        });
      };

    }, frameInterval);

    await page.goto(`file://${htmlPath}`, { 
      waitUntil: ['load', 'networkidle0'],
      timeout: 30000
    });

    logger.info(`[${jobId}] انتظار تحميل الخطوط...`);
    await page.evaluate(() => {
      return new Promise((resolve) => {
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(() => {
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
    
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      window.__advanceTime(0);
    });

    logger.info(`[${jobId}] 🚀 بدء البث المباشر - ${totalFrames} إطار`);

    for (let i = 0; i < totalFrames; i++) {
      const currentTime = i * frameInterval;
      
      await page.evaluate((time) => {
        window.__advanceTime(time);
      }, currentTime);
      
      await page.waitForTimeout(5);
      
      const screenshotBuffer = await page.screenshot({
        type: 'jpeg',
        quality: 90,
        omitBackground: false,
        captureBeyondViewport: false
      });

      ffmpegStdin.write(screenshotBuffer);

      const progress = Math.round((i / totalFrames) * 100);
      if (onProgress && i % Math.ceil(fps / 2) === 0) {
        onProgress(progress);
      }

      if (i % fps === 0) {
        logger.info(`[${jobId}] البث: ${progress}%`);
      }
    }

    ffmpegStdin.end();

    await browser.close();
    logger.info(`[${jobId}] ✅ اكتمل البث المباشر - ${totalFrames} إطار`);
    
    if (onProgress) onProgress(100);
    
    return true;

  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
    throw new Error(`فشل البث: ${error.message}`);
  }
}

async function captureFrames({ htmlPath, sessionDir, width, height, duration, fps, jobId, deviceScaleFactor = 1, onProgress }) {
  const totalFrames = duration * fps;
  const frameInterval = 1000 / fps;
  
  let browser;
  
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.CHROMIUM_PATH || '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-web-security',
        '--font-render-hinting=none',
        '--disable-font-subpixel-positioning',
        '--window-size=' + width + ',' + height
      ],
      defaultViewport: {
        width,
        height,
        deviceScaleFactor
      }
    });

    const page = await browser.newPage();
    
    await page.setViewport({ 
      width, 
      height,
      deviceScaleFactor
    });

    await page.evaluateOnNewDocument((frameIntervalMs) => {
      window.__virtualTime = 0;
      window.__timers = [];
      window.__timerIdCounter = 1;
      window.__rafCallbacks = [];
      window.__rafIdCounter = 1;

      const originalSetTimeout = window.setTimeout;
      const originalSetInterval = window.setInterval;
      const originalClearTimeout = window.clearTimeout;
      const originalClearInterval = window.clearInterval;
      const originalDateNow = Date.now;
      const originalPerfNow = performance.now.bind(performance);
      const originalRAF = window.requestAnimationFrame;
      const originalCAF = window.cancelAnimationFrame;

      Date.now = function() {
        return window.__virtualTime;
      };

      performance.now = function() {
        return window.__virtualTime;
      };

      window.setTimeout = function(callback, delay = 0, ...args) {
        const id = window.__timerIdCounter++;
        const executeAt = window.__virtualTime + delay;
        window.__timers.push({
          id,
          callback,
          args,
          executeAt,
          type: 'timeout'
        });
        return id;
      };

      window.setInterval = function(callback, delay = 0, ...args) {
        const id = window.__timerIdCounter++;
        const executeAt = window.__virtualTime + delay;
        window.__timers.push({
          id,
          callback,
          args,
          executeAt,
          delay,
          type: 'interval'
        });
        return id;
      };

      window.clearTimeout = function(id) {
        window.__timers = window.__timers.filter(t => t.id !== id);
      };

      window.clearInterval = function(id) {
        window.__timers = window.__timers.filter(t => t.id !== id);
      };

      window.requestAnimationFrame = function(callback) {
        const id = window.__rafIdCounter++;
        window.__rafCallbacks.push({ id, callback });
        return id;
      };

      window.cancelAnimationFrame = function(id) {
        window.__rafCallbacks = window.__rafCallbacks.filter(r => r.id !== id);
      };

      window.__advanceTime = function(newTime) {
        const oldTime = window.__virtualTime;
        window.__virtualTime = newTime;

        const rafCallbacks = [...window.__rafCallbacks];
        window.__rafCallbacks = [];
        rafCallbacks.forEach(({ callback }) => {
          try {
            callback(window.__virtualTime);
          } catch (e) {
            console.error('RAF callback error:', e);
          }
        });

        const timersToExecute = window.__timers.filter(t => t.executeAt <= newTime);
        window.__timers = window.__timers.filter(t => t.executeAt > newTime);

        timersToExecute.forEach(timer => {
          if (timer.type === 'interval') {
            window.__timers.push({
              ...timer,
              executeAt: timer.executeAt + timer.delay
            });
          }
        });

        timersToExecute.sort((a, b) => a.executeAt - b.executeAt);

        timersToExecute.forEach(timer => {
          try {
            timer.callback(...timer.args);
          } catch (e) {
            console.error('Timer callback error:', e);
          }
        });

        document.querySelectorAll('*').forEach(el => {
          const computed = getComputedStyle(el);
          if (computed.animationName && computed.animationName !== 'none') {
            el.style.animationDelay = `-${newTime}ms`;
            el.style.animationPlayState = 'paused';
          }
        });

        document.getAnimations().forEach(animation => {
          animation.currentTime = newTime;
        });
      };

    }, frameInterval);

    await page.goto(`file://${htmlPath}`, { 
      waitUntil: ['load', 'networkidle0'],
      timeout: 30000
    });

    logger.info(`[${jobId}] انتظار تحميل الخطوط...`);
    await page.evaluate(() => {
      return new Promise((resolve) => {
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(() => {
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
    
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      window.__advanceTime(0);
    });

    logger.info(`[${jobId}] بدء التقاط ${totalFrames} إطار...`);

    for (let i = 0; i < totalFrames; i++) {
      const framePath = path.join(sessionDir, `frame_${String(i).padStart(5, '0')}.jpg`);
      const currentTime = i * frameInterval;
      
      await page.evaluate((time) => {
        window.__advanceTime(time);
      }, currentTime);
      
      await page.waitForTimeout(5);
      
      await page.screenshot({
        path: framePath,
        type: 'jpeg',
        quality: 98,
        omitBackground: false,
        captureBeyondViewport: false
      });

      const progress = Math.round((i / totalFrames) * 100);
      if (onProgress && i % Math.ceil(fps / 2) === 0) {
        onProgress(progress);
      }

      if (i % fps === 0) {
        logger.info(`[${jobId}] التقاط: ${progress}%`);
      }
    }

    await browser.close();
    logger.info(`[${jobId}] ✅ اكتمل التقاط ${totalFrames} إطار`);
    
    if (onProgress) onProgress(100);
    
    return sessionDir;

  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
    throw new Error(`فشل التقاط الإطارات: ${error.message}`);
  }
}

module.exports = { captureFrames, captureFramesStreaming };
