// محرك توليد الفيديو - نسخة محسّنة ✅
class VideoGeneratorWASM {
    constructor() {
        this.ffmpeg = null;
        this.isLoaded = false;
        this.progressCallback = null;
        this.maxDuration = 20;
        this.abortController = null;
    }

    pad5(n) { return String(n).padStart(5, '0'); }

    async safeUnlink(path) {
        try { await this.ffmpeg.deleteFile(path); } catch {}
    }

    async safeReaddir(dir = '/') {
        try { 
            const files = await this.ffmpeg.listDir(dir);
            return files.map(f => f.name);
        } catch { return []; }
    }

    async cleanupWasmTemp({ 
        framesInPart = 0, 
        framesOnly = false, 
        cleanParts = true, 
        cleanList = true, 
        cleanHtml2canvasCache = false 
    } = {}) {
        if (!this.ffmpeg) return;

        if (framesInPart > 0) {
            for (let i = 1; i <= framesInPart; i++) {
                await this.safeUnlink(`frame_${this.pad5(i)}.jpg`);
            }
            if (framesOnly) {
                if (cleanHtml2canvasCache && window.html2canvas) {
                    try { window.html2canvas.cache = {}; } catch {}
                }
                return;
            }
        }

        const files = await this.safeReaddir('/');
        for (const f of files) {
            if (f.startsWith('frame_') && f.endsWith('.jpg')) await this.safeUnlink(f);
            if (cleanParts && f.startsWith('part_') && f.endsWith('.mp4')) await this.safeUnlink(f);
        }

        if (cleanList) await this.safeUnlink('list.txt');

        if (cleanHtml2canvasCache && window.html2canvas) {
            try { window.html2canvas.cache = {}; } catch {}
        }
    }

    async _rAF() { 
        await new Promise(r => requestAnimationFrame(() => r())); 
    }

    async settleAfterSeek() { 
        await this._rAF();
        await this._rAF();
        await this._rAF();
        await new Promise(r => setTimeout(r, 50));
    }

    checkBrowserSupport() {
        const issues = [];
        if (typeof WebAssembly === 'undefined') issues.push('WebAssembly غير مدعوم');
        if (!window.isSecureContext) issues.push('يجب فتح الموقع عبر HTTPS');
        return { supported: issues.length === 0, issues };
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
                console.error('❌ Browser not supported:', support.issues);
                this.updateProgress('error', support.issues.join('\n'), 0);
                return false;
            }
            
            this.updateProgress('loading', 'جاري تحميل محرك الفيديو...', 5);
            
            await Promise.race([
                this.loadScript('/libs/ffmpeg/ffmpeg.min.js'),
                new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 60000))
            ]);
            
            this.updateProgress('loading', 'جاري تهيئة FFmpeg...', 10);
            
            if (!window.FFmpegWASM?.FFmpeg) throw new Error('FFmpeg not loaded');
            
            this.ffmpeg = new window.FFmpegWASM.FFmpeg();
            
            this.ffmpeg.on('log', ({ message }) => console.log('[FFmpeg]', message));
            this.ffmpeg.on('progress', ({ progress }) => {
                const percent = Math.round(progress * 100);
                this.updateProgress('encoding', `تشفير... ${percent}%`, 55 + percent * 0.2);
            });
            
            this.updateProgress('loading', 'جاري تحميل ملفات FFmpeg...', 15);
            
            const baseURL = window.location.origin + '/libs/ffmpeg';
            await Promise.race([
                this.ffmpeg.load({
                    coreURL: `${baseURL}/ffmpeg-core.js`,
                    wasmURL: `${baseURL}/ffmpeg-core.wasm`,
                }),
                new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 120000))
            ]);
            
            await this.ffmpeg.exec(['-version']);
            
            this.isLoaded = true;
            this.updateProgress('ready', 'محرك الفيديو جاهز!', 20);
            console.log('✅ FFmpeg.wasm loaded');
            return true;
            
        } catch (error) {
            console.error('❌ Failed to load FFmpeg:', error);
            this.updateProgress('error', error.message, 0);
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
        if (doc.defaultView?.seekToTime) {
            doc.defaultView.seekToTime(timeMs);
        }
    }

    resumeAnimations(doc) {
        if (doc.defaultView?.resumeAnimations) {
            doc.defaultView.resumeAnimations();
        }
    }

    async captureFrameBytes(previewElement, canvas, ctx, width, height, frameIndex) {
        const html2canvas = window.html2canvas;
        if (!html2canvas) throw new Error('html2canvas not loaded');

        let targetElement;
        let iframeDoc = null;

        if (previewElement.tagName === 'IFRAME') {
            iframeDoc = previewElement.contentDocument;
            if (!iframeDoc) throw new Error('Cannot access iframe content');
            
            targetElement = this.getCaptureTarget(iframeDoc);

            if (frameIndex === 0) {
                this.lockTargetSize(targetElement, width, height);
            }
        } else {
            targetElement = previewElement;
        }

        try {
            const captureCanvas = await html2canvas(targetElement, {
                width,
                height,
                scale: 1,
                useCORS: true,
                allowTaint: false,
                backgroundColor: '#000000',
                logging: false,
                imageTimeout: 0,
                removeContainer: true,
                windowWidth: width,
                windowHeight: height
            });

            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(captureCanvas, 0, 0, width, height);

            const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.90));
            const bytes = new Uint8Array(await blob.arrayBuffer());

            captureCanvas.width = 0;
            captureCanvas.height = 0;

            return bytes;
            
        } catch (captureError) {
            console.warn(`Frame ${frameIndex} capture fallback:`, captureError);
            
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#ffffff';
            ctx.font = '24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`Frame ${frameIndex}`, width / 2, height / 2);
            
            const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.90));
            return new Uint8Array(await blob.arrayBuffer());
        }
    }

    async renderMP4Deterministic({
        previewElement,
        canvas,
        ctx,
        width,
        height,
        duration,
        fps = 30,
        crf = 18,
        preset = 'veryfast',
        maxDuration = 20,
        secondsPerPart = 4,
        outputFile = 'final.mp4'
    }) {
        try {
            await this.cleanupWasmTemp({ 
                framesOnly: false, 
                cleanParts: true, 
                cleanList: true, 
                cleanHtml2canvasCache: true 
            });

            const iframeDoc = previewElement.tagName === 'IFRAME' ? previewElement.contentDocument : null;
            const iframeWin = previewElement.tagName === 'IFRAME' ? previewElement.contentWindow : null;

            if (iframeWin?.setCaptureMode) {
                iframeWin.setCaptureMode(true);
                await new Promise(r => setTimeout(r, 100));
            }

            if (iframeWin?.__capturePrepare) {
                this.updateProgress('capturing', 'انتظار تحميل الموارد...', 3);
                await iframeWin.__capturePrepare();
            }

            const effectiveDuration = Math.min(duration, maxDuration);
            const totalFrames = Math.floor(fps * effectiveDuration);
            const framesPerPart = Math.max(1, Math.floor(fps * secondsPerPart));
            const partCount = Math.ceil(totalFrames / framesPerPart);
            const partFiles = [];

            this.updateProgress('capturing', 'بدء الالتقاط...', 5);

            for (let part = 0; part < partCount; part++) {
                const start = part * framesPerPart;
                const end = Math.min(start + framesPerPart, totalFrames);
                const framesInPart = end - start;

                for (let local = 0; local < framesInPart; local++) {
                    const i = start + local;
                    const currentTime = i / fps;

                    if (iframeDoc) this.seekAnimationsToTime(iframeDoc, currentTime);
                    await this.settleAfterSeek();

                    if (iframeWin?.__capturePrepare) {
                        await iframeWin.__capturePrepare();
                    }

                    const bytes = await this.captureFrameBytes(previewElement, canvas, ctx, width, height, i);
                    await this.ffmpeg.writeFile(`frame_${this.pad5(local + 1)}.jpg`, bytes);

                    const captureRatio = (i + 1) / totalFrames;
                    if (i % 2 === 0) {
                        this.updateProgress('capturing', 
                            `التقاط ${i + 1}/${totalFrames}`, 
                            5 + captureRatio * 45
                        );
                    }
                }

                const partName = `part_${this.pad5(part + 1)}.mp4`;
                this.updateProgress('encoding', `تشفير ${part + 1}/${partCount}...`, 55);

                await this.ffmpeg.exec([
                    '-framerate', String(fps),
                    '-i', 'frame_%05d.jpg',
                    '-c:v', 'libx264',
                    '-pix_fmt', 'yuv420p',
                    '-crf', String(crf),
                    '-preset', preset,
                    '-tune', 'film',
                    '-movflags', '+faststart',
                    '-y',
                    partName
                ]);

                partFiles.push(partName);

                await this.cleanupWasmTemp({
                    framesOnly: true,
                    framesInPart,
                    cleanHtml2canvasCache: (part % 2 === 0)
                });

                this.updateProgress('encoding', `تم ${part + 1}/${partCount}`, 55 + ((part + 1) / partCount) * 20);
            }

            if (iframeWin?.setCaptureMode) {
                iframeWin.setCaptureMode(false);
            }

            if (iframeDoc) {
                this.resumeAnimations(iframeDoc);
            }

            if (partFiles.length === 1) {
                const singlePartData = await this.ffmpeg.readFile(partFiles[0]);
                await this.ffmpeg.writeFile(outputFile, singlePartData);
            } else {
                const listTxt = partFiles.map(p => `file '${p}'`).join('\n');
                await this.ffmpeg.writeFile('list.txt', new TextEncoder().encode(listTxt));

                this.updateProgress('encoding', 'دمج الأجزاء...', 78);

                await this.ffmpeg.exec([
                    '-f', 'concat',
                    '-safe', '0',
                    '-i', 'list.txt',
                    '-c', 'copy',
                    '-y',
                    outputFile
                ]);
            }

            const data = await this.ffmpeg.readFile(outputFile);

            await this.cleanupWasmTemp({ 
                framesOnly: false, 
                cleanParts: true, 
                cleanList: true, 
                cleanHtml2canvasCache: true 
            });

            const blob = new Blob([data.buffer], { type: 'video/mp4' });
            const url = URL.createObjectURL(blob);

            this.updateProgress('done', 'تم إنشاء الفيديو ✅', 100);

            return {
                success: true,
                blob,
                url,
                fileName: `video_${Date.now()}.mp4`,
                format: 'MP4',
                size: (blob.size / (1024 * 1024)).toFixed(2) + ' MB'
            };
        } catch (err) {
            await this.cleanupWasmTemp({ 
                framesOnly: false, 
                cleanParts: true, 
                cleanList: true, 
                cleanHtml2canvasCache: true 
            });
            console.error('❌ renderMP4 error:', err);
            return { success: false, error: String(err?.message || err) };
        }
    }

    async renderGIFFromMP4(inputMp4 = 'output.mp4', outputGif = 'output.gif', fps = 15, scaleWidth = 540) {
        this.updateProgress('encoding', 'إنشاء GIF...', 85);

        await this.ffmpeg.exec([
            '-i', inputMp4,
            '-vf', `fps=${fps},scale=${scaleWidth}:-1:flags=lanczos,palettegen`,
            '-y',
            'palette.png'
        ]);

        await this.ffmpeg.exec([
            '-i', inputMp4,
            '-i', 'palette.png',
            '-lavfi', `fps=${fps},scale=${scaleWidth}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=sierra2_4a`,
            '-y',
            outputGif
        ]);

        await this.safeUnlink('palette.png');
        return outputGif;
    }

    async generateVideo(config) {
        const { width, height, fps, duration, format, quality } = config;

        if (!this.isLoaded) {
            const loaded = await this.init();
            if (!loaded) throw new Error('فشل تحميل محرك الفيديو');
        }

        const previewElement = document.getElementById('preview-frame');
        if (!previewElement) throw new Error('عنصر المعاينة غير موجود');

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        let crf = quality === 'high' ? 18 : quality === 'low' ? 28 : 23;

        try {
            const mp4Result = await this.renderMP4Deterministic({
                previewElement,
                canvas,
                ctx,
                width,
                height,
                duration,
                fps,
                crf,
                preset: 'veryfast',
                maxDuration: this.maxDuration,
                secondsPerPart: 4,
                outputFile: 'output.mp4'
            });

            if (!mp4Result.success) throw new Error(mp4Result.error || 'فشل إنشاء الفيديو');

            if (format === 'GIF') {
                await this.ffmpeg.writeFile('output.mp4', new Uint8Array(await mp4Result.blob.arrayBuffer()));
                
                const gifFps = Math.min(fps, 15);
                const gifWidth = width > 720 ? 540 : width;
                const gifFile = await this.renderGIFFromMP4('output.mp4', 'output.gif', gifFps, gifWidth);
                
                const gifData = await this.ffmpeg.readFile(gifFile);
                await this.safeUnlink(gifFile);
                await this.safeUnlink('output.mp4');

                const gifBlob = new Blob([gifData.buffer], { type: 'image/gif' });
                const gifUrl = URL.createObjectURL(gifBlob);

                URL.revokeObjectURL(mp4Result.url);

                this.updateProgress('done', 'تم إنشاء GIF ✅', 100);

                return {
                    success: true,
                    blob: gifBlob,
                    url: gifUrl,
                    fileName: `video_${Date.now()}.gif`,
                    format: 'GIF',
                    size: (gifBlob.size / (1024 * 1024)).toFixed(2) + ' MB'
                };
            }

            return mp4Result;

        } catch (error) {
            console.error('❌ Video generation error:', error);
            await this.cleanupWasmTemp({ 
                framesOnly: false, 
                cleanParts: true, 
                cleanList: true, 
                cleanHtml2canvasCache: true 
            });

            if (error.message?.includes('OOM') || error.message?.includes('memory')) {
                throw new Error('نفدت الذاكرة - جرب مدة أقصر');
            }
            throw new Error(`فشل: ${error.message}`);
        }
    }

    abort() {
        if (this.abortController) this.abortController.abort();
    }

    async clearFrames() {
        await this.cleanupWasmTemp({ 
            framesOnly: false, 
            cleanParts: true, 
            cleanList: true, 
            cleanHtml2canvasCache: true 
        });
    }
}

window.VideoGeneratorWASM = VideoGeneratorWASM;
