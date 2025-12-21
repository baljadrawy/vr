class VideoGeneratorWASM {
    constructor() {
        this.ffmpeg = null;
        this.isLoaded = false;
        this.frames = [];
        this.progressCallback = null;
        this.maxDuration = 15;
        this.batchSize = 30;
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
                log: true,
                progress: ({ ratio }) => {
                    const percent = Math.round(ratio * 100);
                    this.updateProgress('encoding', `تشفير الفيديو... ${percent}%`, 50 + percent * 0.4);
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

    async captureAndEncodeStreamlined(previewElement, config) {
        const { width, height, fps, duration, format, quality } = config;
        
        const effectiveDuration = Math.min(duration, this.maxDuration);
        if (duration > this.maxDuration) {
            this.updateProgress('warning', `تم تقليل المدة إلى ${this.maxDuration} ثانية لتجنب مشاكل الذاكرة`, 20);
            await this.delay(1500);
        }
        
        const totalFrames = fps * effectiveDuration;
        
        if (!this.isLoaded) {
            const loaded = await this.init();
            if (!loaded) throw new Error('فشل تحميل محرك الفيديو');
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        this.updateProgress('capturing', 'تحضير الالتقاط...', 22);
        
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
            this.updateProgress('capturing', 'انتظار تحميل الخطوط والصور...', 24);
            await iframeWin.__capturePrepare();
        }
        
        this.updateProgress('capturing', 'بدء التقاط الإطارات...', 25);
        
        let frameIndex = 0;
        const batchCount = Math.ceil(totalFrames / this.batchSize);
        
        for (let batch = 0; batch < batchCount; batch++) {
            const batchStart = batch * this.batchSize;
            const batchEnd = Math.min(batchStart + this.batchSize, totalFrames);
            const batchFrames = [];
            
            for (let i = batchStart; i < batchEnd; i++) {
                const currentTime = i / fps;
                
                if (iframeDoc) {
                    this.seekAnimationsToTime(iframeDoc, currentTime);
                }
                
                if (iframeWin && iframeWin.__capturePrepare) {
                    await iframeWin.__capturePrepare();
                }
                
                const frameData = await this.captureFrameData(previewElement, canvas, ctx, width, height, i);
                batchFrames.push({ index: i, data: frameData });
                
                const progress = 25 + (i / totalFrames) * 35;
                if (i % 3 === 0) {
                    this.updateProgress('capturing', `التقاط الإطار ${i + 1}/${totalFrames}`, progress);
                }
            }
            
            this.updateProgress('processing', `كتابة الدفعة ${batch + 1}/${batchCount}...`, 60 + (batch / batchCount) * 15);
            
            for (const frame of batchFrames) {
                const base64Data = frame.data.split(',')[1];
                const binaryData = atob(base64Data);
                const bytes = new Uint8Array(binaryData.length);
                for (let j = 0; j < binaryData.length; j++) {
                    bytes[j] = binaryData.charCodeAt(j);
                }
                
                const fileName = `frame${String(frame.index).padStart(5, '0')}.png`;
                this.ffmpeg.FS('writeFile', fileName, bytes);
            }
            
            batchFrames.length = 0;
            
            await this.delay(50);
        }
        
        if (iframeWin && iframeWin.setCaptureMode) {
            iframeWin.setCaptureMode(false);
        }
        
        if (iframeDoc) {
            this.resumeAnimations(iframeDoc);
        }
        
        this.updateProgress('encoding', 'بدء تشفير الفيديو...', 78);
        
        const outputFile = format === 'GIF' ? 'output.gif' : 'output.mp4';
        
        try {
            if (format === 'GIF') {
                await this.ffmpeg.run(
                    '-framerate', String(fps),
                    '-i', 'frame%05d.png',
                    '-vf', `scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer`,
                    '-loop', '0',
                    outputFile
                );
            } else {
                const crf = quality === 'high' ? '23' : quality === 'low' ? '32' : '28';
                await this.ffmpeg.run(
                    '-framerate', String(fps),
                    '-i', 'frame%05d.png',
                    '-c:v', 'libx264',
                    '-pix_fmt', 'yuv420p',
                    '-crf', crf,
                    '-preset', 'ultrafast',
                    '-tune', 'animation',
                    outputFile
                );
            }
            
            this.updateProgress('encoding', 'جاري استخراج الفيديو...', 95);
            
            const data = this.ffmpeg.FS('readFile', outputFile);
            
            for (let i = 0; i < totalFrames; i++) {
                const fileName = `frame${String(i).padStart(5, '0')}.png`;
                try {
                    this.ffmpeg.FS('unlink', fileName);
                } catch (e) {}
            }
            try {
                this.ffmpeg.FS('unlink', outputFile);
            } catch (e) {}
            
            const mimeType = format === 'GIF' ? 'image/gif' : 'video/mp4';
            const blob = new Blob([data.buffer], { type: mimeType });
            const url = URL.createObjectURL(blob);
            
            this.updateProgress('complete', 'اكتمل التحويل بنجاح!', 100);
            
            return {
                success: true,
                blob,
                url,
                fileName: `video_${Date.now()}.${format === 'GIF' ? 'gif' : 'mp4'}`,
                format,
                size: (blob.size / (1024 * 1024)).toFixed(2) + ' MB'
            };
            
        } catch (error) {
            console.error('FFmpeg error:', error);
            
            for (let i = 0; i < totalFrames; i++) {
                const fileName = `frame${String(i).padStart(5, '0')}.png`;
                try {
                    this.ffmpeg.FS('unlink', fileName);
                } catch (e) {}
            }
            
            if (error.message && error.message.includes('OOM')) {
                throw new Error('نفدت الذاكرة - جرب مدة أقصر أو دقة أقل');
            }
            throw new Error(`فشل تشفير الفيديو: ${error.message}`);
        }
    }
    
    async captureFrameData(previewElement, canvas, ctx, width, height, frameIndex) {
        try {
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
                width: width,
                height: height,
                scale: 1,
                useCORS: true,
                allowTaint: false,
                backgroundColor: null,
                logging: false,
                imageTimeout: 0
            });
            
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(captureCanvas, 0, 0, width, height);
            
            return canvas.toDataURL('image/png', 0.9);
            
        } catch (error) {
            console.error('Frame capture error:', error);
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#ffffff';
            ctx.font = '32px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`Frame ${frameIndex + 1}`, width / 2, height / 2);
            return canvas.toDataURL('image/png', 0.9);
        }
    }

    async captureFrames(previewElement, config) {
        return this.captureAndEncodeStreamlined(previewElement, config);
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

    async generateVideo(config) {
        return this.captureAndEncodeStreamlined(
            document.getElementById('preview-frame'),
            config
        );
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    clearFrames() {
        this.frames = [];
    }
}

window.VideoGeneratorWASM = VideoGeneratorWASM;
