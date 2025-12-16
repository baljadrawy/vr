// إدارة الاتصال بالـ API
class APIManager {
    constructor() {
        // تكوين الـ API
        this.API_URL = window.location.origin;
        this.AUTH_TOKEN = 'your-secret-token-here-change-this-12345'; // يجب أن يطابق .env
        
        // عناصر DOM
        this.convertBtn = document.getElementById('convert-btn');
        this.statusBox = document.getElementById('status');
        this.resultBox = document.getElementById('result');
        
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
        this.showStatus('processing', '🎬 بدء عملية التحويل...', 10);

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
                    fps
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `خطأ في الخادم: ${response.status}`);
            }

            if (data.success) {
                // نجحت العملية
                this.showStatus('success', '✅ اكتمل التحويل بنجاح!', 100);
                
                // إظهار النتيجة
                setTimeout(() => {
                    this.showResult(data);
                }, 500);
            } else {
                throw new Error(data.error || 'حدث خطأ غير معروف');
            }

        } catch (error) {
            console.error('Error:', error);
            this.showStatus('error', `❌ خطأ: ${error.message}`, 0);
        } finally {
            // إعادة تفعيل الزر
            this.convertBtn.disabled = false;
            this.convertBtn.innerHTML = `
                <span class="btn-icon">🎬</span>
                <span class="btn-text">تحويل إلى فيديو</span>
            `;
        }
    }

    showStatus(type, message, progress) {
        this.statusBox.classList.remove('hidden', 'processing', 'success', 'error');
        this.statusBox.classList.add(type);

        const statusText = this.statusBox.querySelector('.status-text');
        const progressFill = this.statusBox.querySelector('.progress-fill');

        statusText.textContent = message;
        progressFill.style.width = `${progress}%`;

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

        // إخفاء صندوق الحالة بعد 2 ثانية
        setTimeout(() => {
            this.statusBox.classList.add('hidden');
        }, 2000);

        // Scroll إلى النتيجة
        this.resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
