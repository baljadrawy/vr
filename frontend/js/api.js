// إدارة الاتصال بالـ API
class APIManager {
    constructor() {
        // تكوين الـ API
        this.API_URL = window.location.origin;
        this.AUTH_TOKEN = 'your-secret-token-here-change-this-12345';
        
        // عناصر DOM
        this.convertBtn = document.getElementById('convert-btn');
        this.statusBox = document.getElementById('status');
        this.resultBox = document.getElementById('result');
        
        this.eventSource = null;
        
        this.init();
    }

    init() {
        this.convertBtn.addEventListener('click', () => this.handleConvert());
    }

    async handleConvert() {
        // جمع البيانات من المحررات
        const html = document.getElementById('html-editor').value;
        const css = document.getElementById('css-editor').value;
        const js = document.getElementById('js-editor').value;
        const resolution = document.getElementById('resolution').value;
        const format = document.getElementById('format').value;
        const duration = parseInt(document.getElementById('duration').value);
        const fps = parseInt(document.getElementById('fps').value);
        const quality = document.getElementById('quality').value;

        // التحقق من الإدخال
        if (!html.trim()) {
            this.showError('يرجى إدخال كود HTML على الأقل');
            return;
        }

        if (duration < 1 || duration > 60) {
            this.showError('المدة يجب أن تكون بين 1-60 ثانية');
            return;
        }

        // تعطيل الزر
        this.convertBtn.disabled = true;
        this.convertBtn.innerHTML = `
            <span class="btn-icon">⏳</span>
            <span class="btn-text">جاري المعالجة...</span>
        `;

        // إخفاء النتائج السابقة
        this.resultBox.classList.add('hidden');

        // إظهار حالة البداية
        this.showStatus('processing', '🎬 بدء عملية التحويل...', 0);

        try {
            // إرسال الطلب
            const response = await fetch(`${this.API_URL}/api/render`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.AUTH_TOKEN}`
                },
                body: JSON.stringify({
                    html,
                    css,
                    js,
                    resolution,
                    format,
                    duration,
                    fps,
                    quality
                })
            });

            // التحقق من نوع الاستجابة
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Server returned non-JSON:', text.substring(0, 200));
                throw new Error('الخادم أرجع استجابة غير صالحة. حاول مرة أخرى.');
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `خطأ في الخادم: ${response.status}`);
            }

            if (data.success && data.jobId) {
                // الاشتراك في تحديثات التقدم
                this.subscribeToProgress(data.jobId);
            } else {
                throw new Error(data.error || 'حدث خطأ غير معروف');
            }

        } catch (error) {
            console.error('Error:', error);
            this.showStatus('error', `❌ خطأ: ${error.message}`, 0);
            this.resetButton();
        }
    }

    subscribeToProgress(jobId) {
        // إغلاق اتصال سابق إن وجد
        if (this.eventSource) {
            this.eventSource.close();
        }

        this.eventSource = new EventSource(`${this.API_URL}/api/render/progress/${jobId}`);

        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.stage === 'complete') {
                    // اكتمل التحويل
                    this.eventSource.close();
                    this.eventSource = null;
                    
                    const result = JSON.parse(data.message);
                    this.showStatus('success', '✅ اكتمل التحويل بنجاح!', 100);
                    
                    setTimeout(() => {
                        this.showResult(result);
                    }, 500);
                    
                    this.resetButton();
                    
                } else if (data.stage === 'error') {
                    // حدث خطأ
                    this.eventSource.close();
                    this.eventSource = null;
                    
                    this.showStatus('error', `❌ خطأ: ${data.message}`, 0);
                    this.resetButton();
                    
                } else {
                    // تحديث التقدم
                    this.showStatus('processing', data.message, data.progress);
                }
            } catch (e) {
                console.error('Error parsing SSE data:', e);
            }
        };

        this.eventSource.onerror = (error) => {
            console.error('SSE Error:', error);
            // لا نغلق مباشرة - قد يكون انقطاع مؤقت
            setTimeout(() => {
                if (this.eventSource && this.eventSource.readyState === EventSource.CLOSED) {
                    this.showStatus('error', '❌ انقطع الاتصال بالخادم', 0);
                    this.resetButton();
                }
            }, 5000);
        };
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
        
        // إضافة transition سلسة
        progressFill.style.transition = 'width 0.3s ease-out';

        // تحديث أيقونة الحالة
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

        // تحديث معلومات النتيجة
        document.getElementById('result-resolution').textContent = data.resolution || 'N/A';
        document.getElementById('result-format').textContent = data.format || 'N/A';
        document.getElementById('result-time').textContent = data.processingTime || 'N/A';

        // رابط التحميل
        const downloadLink = document.getElementById('download-link');
        downloadLink.href = data.downloadUrl;
        downloadLink.download = data.fileName;

        // حفظ بيانات الملف للمشاركة
        this.currentFile = {
            url: data.downloadUrl,
            fileName: data.fileName,
            format: data.format
        };

        // إظهار زر المشاركة إذا كان Web Share API متاح
        this.setupShareButton();

        // إخفاء صندوق الحالة بعد 2 ثانية
        setTimeout(() => {
            this.statusBox.classList.add('hidden');
        }, 2000);

        // Scroll إلى النتيجة
        this.resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    setupShareButton() {
        const shareBtn = document.getElementById('share-btn');
        
        // التحقق من دعم Web Share API مع الملفات
        if (navigator.share && navigator.canShare) {
            shareBtn.classList.remove('hidden');
            
            // إزالة المستمعين السابقين
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

            // تحميل الملف كـ Blob
            const response = await fetch(this.currentFile.url);
            const blob = await response.blob();
            
            // تحديد نوع الملف
            const mimeType = this.currentFile.format === 'GIF' ? 'image/gif' : 'video/mp4';
            const file = new File([blob], this.currentFile.fileName, { type: mimeType });

            // التحقق من إمكانية مشاركة الملف
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
                // إذا لم يكن مدعوماً، نسخ الرابط بدلاً من ذلك
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
        // على الكمبيوتر: تحميل الملف
        if (window.app) {
            window.app.showNotification('حمّل الملف ثم شاركه من تطبيقك المفضل 📥');
        }
        // تفعيل التحميل تلقائياً
        document.getElementById('download-link').click();
    }

    showError(message) {
        this.showStatus('error', `❌ ${message}`, 0);
        
        setTimeout(() => {
            this.statusBox.classList.add('hidden');
        }, 4000);
    }
}

// تهيئة API Manager
document.addEventListener('DOMContentLoaded', () => {
    window.apiManager = new APIManager();
});
