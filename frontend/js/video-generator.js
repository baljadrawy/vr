class VideoGeneratorWASM {
    constructor() {
        this.ffmpeg = null;
        this.isLoaded = false;
        this.frames = [];
        this.progressCallback = null;
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
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async init() {
        if (this.isLoaded) return true;

        try {
            this.updateProgress('loading', 'جاري تحميل محرك الفيديو...', 5);
            
            await this.loadScript('/libs/ffmpeg/ffmpeg.min.js');
            
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
            
            await this.ffmpeg.load();
            
            this.isLoaded = true;
            this.updateProgress('ready', 'محرك الفيديو جاهز!', 20);
            console.log('✅ FFmpeg.wasm loaded successfully');
            return true;
            
        } catch (error) {
            console.error('❌ Failed to load FFmpeg:', error);
            this.updateProgress('error', `فشل تحميل محرك الفيديو: ${error.message}`, 0);
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

    async captureFrames(previewElement, config) {
        const { width, height, fps, duration } = config;
        const totalFrames = fps * duration;
        
        this.frames = [];
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        this.updateProgress('capturing', 'بدء التقاط الإطارات...', 25);
        
        let iframeDoc = null;
        if (previewElement.tagName === 'IFRAME') {
            try {
                iframeDoc = previewElement.contentDocument || previewElement.contentWindow.document;
            } catch (e) {
                console.warn('Cannot access iframe document');
            }
        }
        
        for (let i = 0; i < totalFrames; i++) {
            const currentTime = i / fps;
            
            if (iframeDoc) {
                this.seekAnimationsToTime(iframeDoc, currentTime);
            }
            
            await this.delay(50);
            
            await this.captureFrame(previewElement, canvas, ctx, width, height, i, totalFrames);
            
            const progress = 25 + (i / totalFrames) * 25;
            if (i % 5 === 0) {
                this.updateProgress('capturing', `التقاط الإطار ${i + 1}/${totalFrames}`, progress);
            }
        }
        
        if (iframeDoc) {
            this.resumeAnimations(iframeDoc);
        }
        
        this.updateProgress('capturing', `تم التقاط ${totalFrames} إطار!`, 50);
        return this.frames;
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

    async captureFrame(previewElement, canvas, ctx, width, height, frameIndex, totalFrames) {
        try {
            const html2canvas = window.html2canvas;
            if (!html2canvas) {
                throw new Error('html2canvas not loaded');
            }
            
            let targetElement;
            if (previewElement.tagName === 'IFRAME') {
                try {
                    const iframeDoc = previewElement.contentDocument || previewElement.contentWindow.document;
                    targetElement = iframeDoc.body;
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
                allowTaint: true,
                backgroundColor: '#000000',
                logging: false
            });
            
            ctx.drawImage(captureCanvas, 0, 0, width, height);
            
            const dataUrl = canvas.toDataURL('image/png');
            this.frames.push(dataUrl);
            
        } catch (error) {
            console.error('Frame capture error:', error);
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#ffffff';
            ctx.font = '48px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`Frame ${frameIndex + 1}`, width / 2, height / 2);
            this.frames.push(canvas.toDataURL('image/png'));
        }
    }

    async generateVideo(config) {
        if (!this.isLoaded) {
            const loaded = await this.init();
            if (!loaded) throw new Error('فشل تحميل محرك الفيديو');
        }

        const { fps, format, quality } = config;
        const { fetchFile } = window.FFmpeg;
        
        this.updateProgress('processing', 'تحضير الإطارات للتشفير...', 52);
        
        for (let i = 0; i < this.frames.length; i++) {
            const frameData = this.frames[i];
            const base64Data = frameData.split(',')[1];
            const binaryData = atob(base64Data);
            const bytes = new Uint8Array(binaryData.length);
            for (let j = 0; j < binaryData.length; j++) {
                bytes[j] = binaryData.charCodeAt(j);
            }
            
            const fileName = `frame${String(i).padStart(5, '0')}.png`;
            this.ffmpeg.FS('writeFile', fileName, bytes);
            
            if (i % 10 === 0) {
                const progress = 52 + (i / this.frames.length) * 10;
                this.updateProgress('processing', `تحضير الإطار ${i + 1}/${this.frames.length}`, progress);
            }
        }
        
        this.updateProgress('encoding', 'بدء تشفير الفيديو...', 65);
        
        const outputFile = format === 'GIF' ? 'output.gif' : 'output.mp4';
        
        try {
            if (format === 'GIF') {
                await this.ffmpeg.run(
                    '-framerate', String(fps),
                    '-i', 'frame%05d.png',
                    '-vf', 'split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
                    '-loop', '0',
                    outputFile
                );
            } else {
                const crf = quality === 'high' ? '18' : quality === 'low' ? '28' : '23';
                await this.ffmpeg.run(
                    '-framerate', String(fps),
                    '-i', 'frame%05d.png',
                    '-c:v', 'libx264',
                    '-pix_fmt', 'yuv420p',
                    '-crf', crf,
                    '-preset', 'fast',
                    outputFile
                );
            }
            
            this.updateProgress('encoding', 'جاري استخراج الفيديو...', 95);
            
            const data = this.ffmpeg.FS('readFile', outputFile);
            
            for (let i = 0; i < this.frames.length; i++) {
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
            throw new Error(`فشل تشفير الفيديو: ${error.message}`);
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    clearFrames() {
        this.frames = [];
    }
}

window.VideoGeneratorWASM = VideoGeneratorWASM;
