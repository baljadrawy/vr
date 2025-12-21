function pad5(n) { 
    return String(n).padStart(5, '0'); 
}

function safeUnlink(ffmpeg, path) {
    try { ffmpeg.FS('unlink', path); } catch {}
}

function safeReaddir(ffmpeg, dir = '/') {
    try { return ffmpeg.FS('readdir', dir); } catch { return []; }
}

function cleanupWasmTemp({
    ffmpeg,
    framesInPart = 0,
    framesOnly = false,
    cleanParts = true,
    cleanList = true,
    cleanHtml2canvasCache = false
} = {}) {
    if (!ffmpeg) return;

    if (framesInPart > 0) {
        for (let i = 1; i <= framesInPart; i++) {
            safeUnlink(ffmpeg, `frame_${pad5(i)}.jpg`);
        }
        if (framesOnly) {
            if (cleanHtml2canvasCache && window.html2canvas) {
                try { window.html2canvas.cache = {}; } catch {}
            }
            return;
        }
    }

    const files = safeReaddir(ffmpeg, '/');
    for (const f of files) {
        if (f.startsWith('frame_') && f.endsWith('.jpg')) safeUnlink(ffmpeg, f);
        if (cleanParts && f.startsWith('part_') && f.endsWith('.mp4')) safeUnlink(ffmpeg, f);
    }

    if (cleanList) safeUnlink(ffmpeg, 'list.txt');

    if (cleanHtml2canvasCache && window.html2canvas) {
        try { window.html2canvas.cache = {}; } catch {}
    }
}

async function nextFrame() {
    await new Promise(r => requestAnimationFrame(() => r()));
}

async function settleAfterSeek() {
    await nextFrame();
    await nextFrame();
}

class VideoGeneratorWASM {
    constructor() {
        this.ffmpeg = null;
        this.isLoaded = false;
        this.progressCallback = null;
        this.maxDuration = 20;
        this.abortController = null;
    }

    checkBrowserSupport() {
        const issues = [];
        
        if (typeof SharedArrayBuffer === 'undefined') {
            issues.push('SharedArrayBuffer غير متوفر - يتطلب HTTPS أو localhost');
        }
        
        if (typeof WebAssembly === 'undefined') {
            issues.push('WebAssembly غير مدعوم في هذا المتصفح');
        }
        
        const isSecureContext = window.isSecureContext;
        if (!isSecureContext) {
            issues.push('يجب فتح الموقع عبر HTTPS');
        }
        
        return {
            supported: issues.length === 0,
            issues: issues
        };
    }

    async loadScript(url) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${url}"]`)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = url;
            script.crossOrigin = 'anonymous';
            script.onload = resolve;
            script.onerror = () => reject(new Error(`فشل تحميل: ${url}`));
            document.head.appendChild(script);
        });
    }

    async init() {
        if (this.isLoaded) return true;

        try {
            const support = this.checkBrowserSupport();
            if (!support.supported) {
                const errorMsg = support.issues.join('\n');
                console.error('❌ Browser not supported:', errorMsg);
                this.updateProgress('error', errorMsg, 0);
                return false;
            }
            
            this.updateProgress('loading', 'جاري تحميل محرك الفيديو...', 5);
            
            const loadTimeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('انتهى الوقت - تحقق من اتصال الإنترنت')), 60000)
            );
            
            await Promise.race([
                this.loadScript('/libs/ffmpeg/ffmpeg.min.js'),
                loadTimeout
            ]);
            
            this.updateProgress('loading', 'جاري تهيئة FFmpeg...', 10);
            
            if (!window.FFmpeg || !window.FFmpeg.createFFmpeg) {
                throw new Error('FFmpeg not loaded properly');
            }
            
            const corePath = window.location.origin + '/libs/ffmpeg/ffmpeg-core.js';
            
            this.ffmpeg = window.FFmpeg.createFFmpeg({
                corePath: corePath,
                log: false,
                progress: ({ ratio }) => {
                    const percent = Math.round(ratio * 100);
                    this.updateProgress('encoding', `تشفير الفيديو... ${percent}%`, 70 + percent * 0.25);
                }
            });
            
            this.updateProgress('loading', 'جاري تحميل ملفات FFmpeg (~24MB)...', 15);
            
            const ffmpegLoadTimeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('فشل تحميل FFmpeg - حاول مرة أخرى')), 120000)
            );
            
            await Promise.race([
                this.ffmpeg.load(),
                ffmpegLoadTimeout
            ]);
            
            this.isLoaded = true;
            this.updateProgress('ready', 'محرك الفيديو جاهز!', 20);
            console.log('✅ FFmpeg.wasm loaded successfully');
            return true;
            
        } catch (error) {
            console.error('❌ Failed to load FFmpeg:', error);
            let userMessage = error.message;
            
            if (error.message.includes('SharedArrayBuffer')) {
                userMessage = 'المتصفح لا يدعم هذه الميزة - جرب Chrome أو Edge';
            } else if (error.message.includes('network') || error.message.includes('fetch')) {
                userMessage = 'فشل الاتصال - تحقق من الإنترنت وحاول مجدداً';
            }
            
            this.updateProgress('error', userMessage, 0);
            return false;
        }
    }

    setProgressCallback(callback) {
        this.progressCallback = callback;
    }

    updateProgress(stage, message, progress) {
        if (this.progressCallback) {
            this.progressCallback({ stage, message, progress });
        }
    }

    getResolution(resolutionType) {
        const resolutions = {
            'HD_Vertical': { width: 1080, height: 1920 },
            'HD_Horizontal': { width: 1920, height: 1080 },
            'Square': { width: 1080, height: 1080 }
        };
        return resolutions[resolutionType] || resolutions['HD_Vertical'];
    }

    getCaptureTarget(iframeDoc) {
        return (
            iframeDoc.querySelector('[data-capture-root]') ||
            iframeDoc.querySelector('.reel-container') ||
            iframeDoc.querySelector('#root') ||
            iframeDoc.body
        );
    }

    lockTargetSize(target, width, height) {
        target.style.width = width + 'px';
        target.style.height = height + 'px';
        target.style.overflow = 'hidden';
        target.style.position = 'relative';
    }

    seekAnimationsToTime(doc, timeInSeconds) {
        const timeMs = timeInSeconds * 1000;
        if (doc.defaultView && doc.defaultView.seekToTime) {
            doc.defaultView.seekToTime(timeMs);
        }
    }

    resumeAnimations(doc) {
        if (doc.defaultView && doc.defaultView.resumeAnimations) {
            doc.defaultView.resumeAnimations();
        }
    }

    async captureFrameJpegBytes(previewElement, canvas, ctx, width, height, frameIndex) {
        const html2canvas = window.html2canvas;
        if (!html2canvas) {
            throw new Error('html2canvas not loaded');
        }

        let targetElement;
        if (previewElement.tagName === 'IFRAME') {
            try {
                const iframeDoc = previewElement.contentDocument || previewElement.contentWindow.document;
                targetElement = this.getCaptureTarget(iframeDoc);

                if (frameIndex === 0) {
                    this.lockTargetSize(targetElement, width, height);
                }
            } catch (e) {
                targetElement = previewElement;
            }
        } else {
            targetElement = previewElement;
        }

        const captureCanvas = await html2canvas(targetElement, {
            width,
            height,
            scale: 1,
            useCORS: true,
            allowTaint: false,
            backgroundColor: null,
            logging: false,
            imageTimeout: 0
        });

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(captureCanvas, 0, 0, width, height);

        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
        const bytes = new Uint8Array(await blob.arrayBuffer());

        captureCanvas.width = 0;
        captureCanvas.height = 0;

        return bytes;
    }

    async renderMP4({
        previewElement,
        width,
        height,
        duration,
        fps = 30,
        crf = 18,
        preset = 'veryfast',
        quality = 'medium'
    }) {
        const effectiveDuration = Math.min(duration, this.maxDuration);
        if (duration > this.maxDuration) {
            this.updateProgress('warning', `تم تقليل المدة إلى ${this.maxDuration} ثانية لتجنب مشاكل الذاكرة`, 20);
            await this.delay(1000);
        }

        const totalFrames = Math.floor(fps * effectiveDuration);
        const framesPerPart = fps * 4;
        const partCount = Math.ceil(totalFrames / framesPerPart);
        const partFiles = [];

        if (quality === 'high') crf = 18;
        else if (quality === 'low') crf = 28;
        else crf = 23;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        let iframeDoc = null;
        let iframeWin = null;
        if (previewElement.tagName === 'IFRAME') {
            try {
                iframeDoc = previewElement.contentDocument || previewElement.contentWindow.document;
                iframeWin = previewElement.contentWindow;
            } catch (e) {
                console.warn('Cannot access iframe document');
            }
        }

        if (iframeWin && iframeWin.setCaptureMode) {
            iframeWin.setCaptureMode(true);
        }

        if (iframeWin && iframeWin.__capturePrepare) {
            this.updateProgress('capturing', 'انتظار تحميل الخطوط والصور...', 22);
            await iframeWin.__capturePrepare();
        }

        cleanupWasmTemp({ 
            ffmpeg: this.ffmpeg, 
            framesOnly: false, 
            cleanParts: true, 
            cleanList: true, 
            cleanHtml2canvasCache: true 
        });

        this.updateProgress('capturing', 'بدء التقاط الإطارات...', 25);

        for (let part = 0; part < partCount; part++) {
            if (this.abortController?.signal?.aborted) {
                throw new Error('تم إلغاء العملية');
            }

            const start = part * framesPerPart;
            const end = Math.min(start + framesPerPart, totalFrames);
            const framesInPart = end - start;

            for (let local = 0; local < framesInPart; local++) {
                if (this.abortController?.signal?.aborted) {
                    throw new Error('تم إلغاء العملية');
                }

                const i = start + local;
                const currentTime = i / fps;

                if (iframeDoc) {
                    this.seekAnimationsToTime(iframeDoc, currentTime);
                }
                await settleAfterSeek();

                if (iframeWin && iframeWin.__capturePrepare) {
                    await iframeWin.__capturePrepare();
                }

                try {
                    const bytes = await this.captureFrameJpegBytes(
                        previewElement, canvas, ctx, width, height, i
                    );
                    const fileName = `frame_${pad5(local + 1)}.jpg`;
                    this.ffmpeg.FS('writeFile', fileName, bytes);
                } catch (error) {
                    console.error(`Frame ${i} capture error:`, error);
                    ctx.fillStyle = '#1a1a2e';
                    ctx.fillRect(0, 0, width, height);
                    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
                    const bytes = new Uint8Array(await blob.arrayBuffer());
                    this.ffmpeg.FS('writeFile', `frame_${pad5(local + 1)}.jpg`, bytes);
                }

                const captureProgress = 25 + ((i + 1) / totalFrames) * 35;
                if (i % 3 === 0) {
                    this.updateProgress('capturing', `التقاط الإطار ${i + 1}/${totalFrames}`, captureProgress);
                }
            }

            this.updateProgress('encoding', `تشفير الجزء ${part + 1}/${partCount}...`, 60 + (part / partCount) * 15);

            const partName = `part_${pad5(part + 1)}.mp4`;
            await this.ffmpeg.run(
                '-framerate', String(fps),
                '-i', 'frame_%05d.jpg',
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-crf', String(crf),
                '-preset', preset,
                '-tune', 'animation',
                '-movflags', '+faststart',
                partName
            );
            partFiles.push(partName);

            cleanupWasmTemp({
                ffmpeg: this.ffmpeg,
                framesOnly: true,
                framesInPart,
                cleanHtml2canvasCache: (part % 3 === 0)
            });
        }

        if (iframeWin && iframeWin.setCaptureMode) {
            iframeWin.setCaptureMode(false);
        }

        if (iframeDoc) {
            this.resumeAnimations(iframeDoc);
        }

        this.updateProgress('encoding', 'دمج الأجزاء...', 78);

        const outputFile = 'output.mp4';

        if (partFiles.length === 1) {
            const singlePartData = this.ffmpeg.FS('readFile', partFiles[0]);
            this.ffmpeg.FS('writeFile', outputFile, singlePartData);
            safeUnlink(this.ffmpeg, partFiles[0]);
        } else {
            const list = partFiles.map(p => `file '${p}'`).join('\n');
            this.ffmpeg.FS('writeFile', 'list.txt', new TextEncoder().encode(list));

            await this.ffmpeg.run(
                '-f', 'concat',
                '-safe', '0',
                '-i', 'list.txt',
                '-fflags', '+genpts',
                '-c', 'copy',
                outputFile
            );

            cleanupWasmTemp({ 
                ffmpeg: this.ffmpeg, 
                framesOnly: false, 
                cleanParts: true, 
                cleanList: true, 
                cleanHtml2canvasCache: true 
            });
        }

        return { outputFile, effectiveDuration, totalFrames, fps };
    }

    async renderGIFFromMP4(inputMp4 = 'output.mp4', outputGif = 'output.gif', fps = 15, scaleWidth = 540) {
        this.updateProgress('encoding', 'إنشاء GIF...', 85);

        await this.ffmpeg.run(
            '-i', inputMp4,
            '-vf', `fps=${fps},scale=${scaleWidth}:-1:flags=lanczos,palettegen`,
            'palette.png'
        );

        await this.ffmpeg.run(
            '-i', inputMp4,
            '-i', 'palette.png',
            '-lavfi', `fps=${fps},scale=${scaleWidth}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=sierra2_4a`,
            outputGif
        );

        safeUnlink(this.ffmpeg, 'palette.png');
        safeUnlink(this.ffmpeg, inputMp4);

        return outputGif;
    }

    async generateVideo(config) {
        const { width, height, fps, duration, format, quality } = config;

        if (!this.isLoaded) {
            const loaded = await this.init();
            if (!loaded) throw new Error('فشل تحميل محرك الفيديو');
        }

        const previewElement = document.getElementById('preview-frame');
        if (!previewElement) {
            throw new Error('عنصر المعاينة غير موجود');
        }

        this.abortController = new AbortController();

        try {
            const mp4Result = await this.renderMP4({
                previewElement,
                width,
                height,
                duration,
                fps,
                quality
            });

            let finalFile = mp4Result.outputFile;
            let mimeType = 'video/mp4';
            let extension = 'mp4';

            if (format === 'GIF') {
                const gifFps = Math.min(fps, 15);
                const gifWidth = width > 720 ? 540 : width;
                finalFile = await this.renderGIFFromMP4(mp4Result.outputFile, 'output.gif', gifFps, gifWidth);
                mimeType = 'image/gif';
                extension = 'gif';
            }

            this.updateProgress('encoding', 'جاري استخراج الملف...', 95);

            const data = this.ffmpeg.FS('readFile', finalFile);
            safeUnlink(this.ffmpeg, finalFile);

            const blob = new Blob([data.buffer], { type: mimeType });
            const url = URL.createObjectURL(blob);

            this.updateProgress('complete', 'اكتمل التحويل بنجاح!', 100);

            return {
                success: true,
                blob,
                url,
                fileName: `video_${Date.now()}.${extension}`,
                format: format || 'MP4',
                size: (blob.size / (1024 * 1024)).toFixed(2) + ' MB'
            };

        } catch (error) {
            console.error('Video generation error:', error);

            cleanupWasmTemp({ 
                ffmpeg: this.ffmpeg, 
                framesOnly: false, 
                cleanParts: true, 
                cleanList: true, 
                cleanHtml2canvasCache: true 
            });

            if (error.message && (error.message.includes('OOM') || error.message.includes('memory'))) {
                throw new Error('نفدت الذاكرة - جرب مدة أقصر أو دقة أقل');
            }
            throw new Error(`فشل إنشاء الفيديو: ${error.message}`);
        }
    }

    abort() {
        if (this.abortController) {
            this.abortController.abort();
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    clearFrames() {
        cleanupWasmTemp({ 
            ffmpeg: this.ffmpeg, 
            framesOnly: false, 
            cleanParts: true, 
            cleanList: true, 
            cleanHtml2canvasCache: true 
        });
    }
}

window.VideoGeneratorWASM = VideoGeneratorWASM;
