const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const path = require('path');

/**
 * دالة لالتقاط الإطارات وإرسالها مباشرة إلى FFmpeg عبر البث (Streaming)
 */
async function captureFramesStreaming({ htmlPath, ffmpegStdin, width, height, duration, fps, jobId, deviceScaleFactor = 1, onProgress }) {
    const totalFrames = duration * fps;
    const frameInterval = 1000 / fps;
    let browser;

    try {
        // الحصول على مسار المتصفح (بيئة التطوير أو الإنتاج)
        const executablePath = process.env.CHROMIUM_PATH || await chromium.executablePath();
        
        browser = await puppeteer.launch({
            headless: chromium.headless,
            executablePath: executablePath,
            protocolTimeout: 0, 
            args: [
                ...chromium.args,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--disable-web-security',
                '--font-render-hinting=none',
                '--disable-font-subpixel-positioning',
                '--force-color-profile=srgb',
                '--disable-threaded-scrolling',
                '--disable-canvas-aa',
                '--window-size=' + width + ',' + height
            ],
            defaultViewport: { width, height, deviceScaleFactor }
        });

        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(0);

        // 1. حقن نظام الوقت الافتراضي والمزامنة قبل تحميل الصفحة
        await page.evaluateOnNewDocument((fpsValue) => {
            window.__virtualTime = 0;
            window.__rafCallbacks = [];
            window.__rafIdCounter = 1;

            // استبدال دوال الوقت الأساسية لضمان تحكم السيرفر بالزمن
            Date.now = () => window.__virtualTime;
            performance.now = () => window.__virtualTime;

            window.requestAnimationFrame = (callback) => {
                const id = window.__rafIdCounter++;
                window.__rafCallbacks.push({ id, callback });
                return id;
            };

            window.cancelAnimationFrame = (id) => {
                window.__rafCallbacks = window.__rafCallbacks.filter(r => r.id !== id);
            };

            // الدالة الرئيسية لتقديم الوقت
            window.__advanceTime = function(newTime) {
                window.__virtualTime = newTime;

                // أ. مزامنة Lottie (يجب أن يكون المتغير window.anim متاحاً)
                if (window.anim && typeof window.anim.goToAndStop === 'function') {
                    // تحويل ميلي ثانية إلى إطارات (Time * FPS / 1000)
                    const lottieFrame = (newTime * fpsValue) / 1000;
                    window.anim.goToAndStop(lottieFrame, true);
                }

                // ب. مزامنة GSAP Ticker
                if (typeof gsap !== 'undefined' && gsap.ticker) {
                    gsap.ticker.time = newTime / 1000;
                    gsap.ticker.tick();
                }

                // ج. تنفيذ طلبات الإطارات (RAF)
                const rafCallbacks = [...window.__rafCallbacks];
                window.__rafCallbacks = [];
                rafCallbacks.forEach(({ callback }) => {
                    try { callback(window.__virtualTime); } catch (e) { console.error(e); }
                });

                // د. مزامنة Web Animations API
                if (document.getAnimations) {
                    document.getAnimations().forEach(animation => {
                        animation.currentTime = newTime;
                    });
                }
            };
        }, fps);

        // 2. تحميل الصفحة والانتظار حتى يتوقف نشاط الشبكة (لتحميل ملفات JSON لوتي)
        await page.goto(`file://${htmlPath}`, { 
            waitUntil: 'networkidle0', 
            timeout: 60000 
        });

        // 3. التحقق من جاهزية لوتي والخطوط
        await page.evaluate(async () => {
            // انتظار الخطوط
            if (document.fonts) await document.fonts.ready;

            // انتظار لوتي إذا كانت موجودة
            if (window.lottie) {
                await new Promise((resolve) => {
                    if (window.anim && window.anim.isLoaded) resolve();
                    else if (window.anim) window.anim.addEventListener('DOMLoaded', resolve);
                    else setTimeout(resolve, 1000); // Fail-safe
                });
            }

            // إعداد GSAP
            if (typeof gsap !== 'undefined' && gsap.ticker) {
                gsap.ticker.lagSmoothing(0);
                gsap.ticker.sleep();
            }
        });

        // 4. التقاط الإطار صفر (Initial State)
        await page.evaluate(() => window.__advanceTime(0));
        await new Promise(r => setTimeout(r, 100)); // استقرار بسيط

        // 5. حلقة الالتقاط الرئيسية
        for (let i = 0; i < totalFrames; i++) {
            const currentTime = i * frameInterval;

            // تقديم الزمن
            await page.evaluate((time) => window.__advanceTime(time), currentTime);

            // التقاط اللقطة
            const screenshotBuffer = await page.screenshot({
                type: 'jpeg',
                quality: 90,
                omitBackground: false
            });

            // معالجة الـ Backpressure (انتظار FFmpeg إذا امتلأ الأنبوب)
            if (!ffmpegStdin.write(screenshotBuffer)) {
                await new Promise(resolve => ffmpegStdin.once('drain', resolve));
            }

            // تحديث التقدم
            if (onProgress && i % Math.ceil(fps / 2) === 0) {
                onProgress(Math.round((i / totalFrames) * 100));
            }
        }

        ffmpegStdin.end();
        await browser.close();
        return true;

    } catch (error) {
        console.error("Puppeteer Error:", error);
        if (browser) await browser.close();
        throw error;
    }
}

async function captureFrames(options) {
    // يمكن تنفيذ نفس المنطق هنا عند الحاجة لحفظ الصور كملفات بدلاً من البث
}

module.exports = { captureFrames, captureFramesStreaming };