class VideoGeneratorWASM {
    constructor() {
        this.ffmpeg = null;
        this.isLoaded = false;
        this.frames = [];
        this.progressCallback = null;
    }

    async init() {
        if (this.isLoaded) return true;

        try {
            this.updateProgress('loading', 'جاري تحميل محرك الفيديو...', 5);
            
            const { FFmpeg } = await import('https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js');
            const { fetchFile, toBlobURL } = await import('https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js');
            
            this.ffmpeg = new FFmpeg();
            this.fetchFile = fetchFile;
            
            this.ffmpeg.on('log', ({ message }) => {
                console.log('[FFmpeg]', message);
            });
            
            this.ffmpeg.on('progress', ({ progress }) => {
                const percent = Math.round(progress * 100);
                this.updateProgress('encoding', `تشفير الفيديو... ${percent}%`, 50 + percent * 0.4);
            });
            
            this.updateProgress('loading', 'جاري تحميل ملفات FFmpeg...', 10);
            
            const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
            await this.ffmpeg.load({
                coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
                wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
            });
            
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

    async captureFrames(iframe, config) {
        const { width, height, fps, duration } = config;
        const totalFrames = fps * duration;
        const frameInterval = 1000 / fps;
        
        this.frames = [];
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        this.updateProgress('capturing', 'بدء التقاط الإطارات...', 25);
        
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const iframeBody = iframeDoc.body;
        
        for (let i = 0; i < totalFrames; i++) {
            const currentTime = i * frameInterval;
            
            if (iframe.contentWindow && iframe.contentWindow.gsap) {
                iframe.contentWindow.gsap.globalTimeline.time(currentTime / 1000);
            }
            
            await this.captureFrame(iframe, canvas, ctx, width, height);
            
            const progress = 25 + (i / totalFrames) * 25;
            this.updateProgress('capturing', `التقاط الإطار ${i + 1}/${totalFrames}`, progress);
            
            await this.delay(10);
        }
        
        this.updateProgress('capturing', `تم التقاط ${totalFrames} إطار!`, 50);
        return this.frames;
    }

    async captureFrame(iframe, canvas, ctx, width, height) {
        try {
            const html2canvas = window.html2canvas || (await this.loadHtml2Canvas());
            
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const captureCanvas = await html2canvas(iframeDoc.body, {
                width: width,
                height: height,
                scale: 1,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff'
            });
            
            ctx.drawImage(captureCanvas, 0, 0, width, height);
            
            const dataUrl = canvas.toDataURL('image/png');
            this.frames.push(dataUrl);
            
        } catch (error) {
            console.error('Frame capture error:', error);
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#ffffff';
            ctx.font = '48px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Frame Error', width / 2, height / 2);
            this.frames.push(canvas.toDataURL('image/png'));
        }
    }

    async loadHtml2Canvas() {
        return new Promise((resolve, reject) => {
            if (window.html2canvas) {
                resolve(window.html2canvas);
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';
            script.onload = () => resolve(window.html2canvas);
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async generateVideo(config) {
        if (!this.isLoaded) {
            const loaded = await this.init();
            if (!loaded) throw new Error('فشل تحميل محرك الفيديو');
        }

        const { fps, format, quality } = config;
        
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
            await this.ffmpeg.writeFile(fileName, bytes);
            
            if (i % 10 === 0) {
                const progress = 52 + (i / this.frames.length) * 10;
                this.updateProgress('processing', `تحضير الإطار ${i + 1}/${this.frames.length}`, progress);
            }
        }
        
        this.updateProgress('encoding', 'بدء تشفير الفيديو...', 65);
        
        const outputFile = format === 'GIF' ? 'output.gif' : 'output.mp4';
        
        const qualitySettings = {
            'high': '-crf 18',
            'medium': '-crf 23',
            'low': '-crf 28'
        };
        const crf = qualitySettings[quality] || qualitySettings['medium'];
        
        try {
            if (format === 'GIF') {
                await this.ffmpeg.exec([
                    '-framerate', String(fps),
                    '-i', 'frame%05d.png',
                    '-vf', 'split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
                    '-loop', '0',
                    outputFile
                ]);
            } else {
                await this.ffmpeg.exec([
                    '-framerate', String(fps),
                    '-i', 'frame%05d.png',
                    '-c:v', 'libx264',
                    '-pix_fmt', 'yuv420p',
                    crf,
                    '-preset', 'medium',
                    outputFile
                ]);
            }
            
            this.updateProgress('encoding', 'جاري استخراج الفيديو...', 95);
            
            const data = await this.ffmpeg.readFile(outputFile);
            
            for (let i = 0; i < this.frames.length; i++) {
                const fileName = `frame${String(i).padStart(5, '0')}.png`;
                await this.ffmpeg.deleteFile(fileName);
            }
            await this.ffmpeg.deleteFile(outputFile);
            
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

    reshapeArabicText(text) {
        return text;
    }

    clearFrames() {
        this.frames = [];
    }
}

window.VideoGeneratorWASM = VideoGeneratorWASM;
