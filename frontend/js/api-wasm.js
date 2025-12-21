class APIManagerWASM {
    constructor() {
        this.convertBtn = document.getElementById('convert-btn');
        this.statusBox = document.getElementById('status');
        this.resultBox = document.getElementById('result');
        
        this.videoGenerator = new VideoGeneratorWASM();
        this.currentFile = null;
        
        this.init();
    }

    async init() {
        this.convertBtn.addEventListener('click', () => this.handleConvert());
        
        this.videoGenerator.setProgressCallback((data) => {
            this.showStatus(
                data.stage === 'error' ? 'error' : 
                data.stage === 'complete' ? 'success' : 'processing',
                data.message,
                data.progress
            );
        });
        
        this.preloadFFmpeg();
    }

    async preloadFFmpeg() {
        console.log('🎬 جاري تحميل محرك الفيديو في الخلفية...');
    }

    async handleConvert() {
        const html = document.getElementById('html-editor').value;
        const css = document.getElementById('css-editor').value;
        const js = document.getElementById('js-editor').value;
        const resolution = document.getElementById('resolution').value;
        const format = document.getElementById('format').value;
        const duration = parseInt(document.getElementById('duration').value);
        const fps = parseInt(document.getElementById('fps').value);
        const quality = document.getElementById('quality').value;

        if (!html.trim()) {
            this.showError('يرجى إدخال كود HTML على الأقل');
            return;
        }

        if (duration < 1 || duration > 60) {
            this.showError('المدة يجب أن تكون بين 1-60 ثانية');
            return;
        }

        this.convertBtn.disabled = true;
        this.convertBtn.innerHTML = `
            <span class="btn-icon">⏳</span>
            <span class="btn-text">جاري المعالجة...</span>
        `;

        this.resultBox.classList.add('hidden');
        this.showStatus('processing', '🎬 جاري تحميل محرك الفيديو...', 0);

        try {
            const loaded = await this.videoGenerator.init();
            if (!loaded) {
                throw new Error('فشل تحميل محرك الفيديو');
            }

            const { width, height } = this.videoGenerator.getResolution(resolution);
            
            this.showStatus('processing', '🖼️ تحضير المعاينة للتصوير...', 20);
            
            const previewFrame = document.getElementById('preview-frame');
            if (!previewFrame) {
                throw new Error('لم يتم العثور على إطار المعاينة');
            }

            const config = {
                width,
                height,
                fps,
                duration,
                format,
                quality,
                resolution
            };

            const result = await this.videoGenerator.generateVideo(config);

            if (result.success) {
                this.showStatus('success', '✅ اكتمل التحويل بنجاح!', 100);
                
                setTimeout(() => {
                    this.showResult({
                        downloadUrl: result.url,
                        fileName: result.fileName,
                        format: result.format,
                        resolution: resolution,
                        processingTime: 'محلي',
                        size: result.size
                    });
                }, 500);
            }

        } catch (error) {
            console.error('Error:', error);
            this.showStatus('error', `❌ خطأ: ${error.message}`, 0);
        } finally {
            this.resetButton();
            this.videoGenerator.clearFrames();
        }
    }

    resetButton() {
        this.convertBtn.disabled = false;
        this.convertBtn.innerHTML = `
            <span class="btn-icon">🎬</span>
            <span class="btn-text">تحويل إلى فيديو</span>
        `;
    }

    showStatus(type, message, progress) {
        this.statusBox.classList.remove('hidden', 'processing', 'success', 'error');
        this.statusBox.classList.add(type);

        const statusText = this.statusBox.querySelector('.status-text');
        const progressFill = this.statusBox.querySelector('.progress-fill');

        statusText.textContent = message;
        progressFill.style.width = `${progress}%`;
        progressFill.style.transition = 'width 0.3s ease-out';

        const statusIcon = this.statusBox.querySelector('.status-icon');
        if (type === 'processing') {
            statusIcon.innerHTML = '<div class="spinner"></div>';
        } else if (type === 'success') {
            statusIcon.textContent = '✅';
        } else if (type === 'error') {
            statusIcon.textContent = '❌';
        }
    }

    showResult(data) {
        this.resultBox.classList.remove('hidden');

        document.getElementById('result-resolution').textContent = data.resolution || 'N/A';
        document.getElementById('result-format').textContent = data.format || 'N/A';
        document.getElementById('result-time').textContent = data.processingTime || 'N/A';

        const downloadLink = document.getElementById('download-link');
        downloadLink.href = data.downloadUrl;
        downloadLink.download = data.fileName;

        this.currentFile = {
            url: data.downloadUrl,
            fileName: data.fileName,
            format: data.format
        };

        this.setupShareButton();

        setTimeout(() => {
            this.statusBox.classList.add('hidden');
        }, 2000);

        this.resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    setupShareButton() {
        const shareBtn = document.getElementById('share-btn');
        
        if (navigator.share && navigator.canShare) {
            shareBtn.classList.remove('hidden');
            
            shareBtn.replaceWith(shareBtn.cloneNode(true));
            const newShareBtn = document.getElementById('share-btn');
            
            newShareBtn.addEventListener('click', () => this.handleShare());
        } else {
            shareBtn.classList.add('hidden');
        }
    }

    async handleShare() {
        if (!this.currentFile) return;

        const shareBtn = document.getElementById('share-btn');
        const originalHTML = shareBtn.innerHTML;
        
        try {
            shareBtn.disabled = true;
            shareBtn.innerHTML = `
                <span class="btn-icon">⏳</span>
                <span class="btn-text">جاري التحضير...</span>
            `;

            const response = await fetch(this.currentFile.url);
            const blob = await response.blob();
            
            const mimeType = this.currentFile.format === 'GIF' ? 'image/gif' : 'video/mp4';
            const file = new File([blob], this.currentFile.fileName, { type: mimeType });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: 'فيديو من محول الويب',
                    text: 'شاهد هذا الفيديو الذي أنشأته!',
                    files: [file]
                });
                
                if (window.app) {
                    window.app.showNotification('تمت المشاركة بنجاح! ✅');
                }
            } else {
                this.fallbackShare();
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Share error:', error);
                this.fallbackShare();
            }
        } finally {
            shareBtn.disabled = false;
            shareBtn.innerHTML = originalHTML;
        }
    }

    fallbackShare() {
        if (window.app) {
            window.app.showNotification('حمّل الملف ثم شاركه من تطبيقك المفضل 📥');
        }
        document.getElementById('download-link').click();
    }

    showError(message) {
        this.showStatus('error', `❌ ${message}`, 0);
        
        setTimeout(() => {
            this.statusBox.classList.add('hidden');
        }, 4000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.apiManager = new APIManagerWASM();
    console.log('✅ WASM API Manager جاهز!');
});
