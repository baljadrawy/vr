// معاينة مباشرة للكود
class PreviewManager {
    constructor() {
        this.preview = document.getElementById('preview');
        this.htmlEditor = document.getElementById('html-editor');
        this.cssEditor = document.getElementById('css-editor');
        this.jsEditor = document.getElementById('js-editor');
        this.resolutionSelect = document.getElementById('resolution');
        this.resolutionIndicator = document.getElementById('resolution-indicator');
        this.refreshBtn = document.getElementById('refresh-preview');
        this.restartBtn = document.getElementById('restart-preview');
        this.previewLoading = document.getElementById('preview-loading');
        
        this.debounceTimer = null;
        this.debounceDelay = 1000; // تأخير ثانية واحدة
        
        // تخزين كود المكتبات
        this.gsapCode = '';
        this.twemojiCode = '';
        this.librariesLoaded = false;

        this.init();
    }

    async init() {
        // تحميل المكتبات أولاً
        await this.loadLibraries();
        
        // تحديث المعاينة عند تغيير الكود (مع debounce)
        [this.htmlEditor, this.cssEditor, this.jsEditor].forEach(editor => {
            editor.addEventListener('input', () => this.debouncedUpdate());
        });

        // تحديث الدقة عند التغيير
        this.resolutionSelect.addEventListener('change', () => {
            this.updateResolutionDisplay();
            this.updatePreview();
        });

        // زر التحديث اليدوي
        this.refreshBtn.addEventListener('click', () => {
            this.updatePreview();
        });

        // زر إعادة التشغيل
        this.restartBtn.addEventListener('click', () => {
            this.restartPreview();
        });

        // تحديث أولي
        this.updateResolutionDisplay();
        this.updatePreview();
    }
    
    async loadLibraries() {
        try {
            // تحميل GSAP و Twemoji بالتوازي
            const [gsapResponse, twemojiResponse] = await Promise.all([
                fetch('/api/libs/gsap.js'),
                fetch('/api/libs/twemoji.js')
            ]);
            
            if (gsapResponse.ok) {
                this.gsapCode = await gsapResponse.text();
                console.log('✅ GSAP loaded for preview');
            }
            
            if (twemojiResponse.ok) {
                this.twemojiCode = await twemojiResponse.text();
                console.log('✅ Twemoji loaded for preview');
            }
            
            this.librariesLoaded = true;
        } catch (error) {
            console.error('Error loading libraries:', error);
            this.librariesLoaded = true; // Continue anyway
        }
    }

    debouncedUpdate() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.updatePreview();
        }, this.debounceDelay);
    }

    updateResolutionDisplay() {
        const resolution = this.resolutionSelect.value;
        const resolutions = {
            'HD_Vertical': { width: 1080, height: 1920, class: 'vertical' },
            'Square': { width: 1080, height: 1080, class: 'square' },
            'HD_Horizontal': { width: 1920, height: 1080, class: 'horizontal' }
        };

        const selected = resolutions[resolution];
        this.resolutionIndicator.textContent = `${selected.width} × ${selected.height}`;

        // تغيير نسبة العرض للمعاينة
        const container = document.querySelector('.preview-container');
        container.className = 'preview-container ' + selected.class;
    }

    updatePreview() {
        const html = this.htmlEditor.value;
        const css = this.cssEditor.value;
        const js = this.jsEditor.value;

        // إظهار loader
        this.showLoading();

        // إزالة سكربتات GSAP CDN من HTML (سنستخدم النسخة المحلية)
        const scriptRegex = /<script\s+src=["'][^"']*gsap[^"']*["'][^>]*>\s*<\/script>/gi;
        const htmlClean = html.replace(scriptRegex, '');

        // إنشاء المحتوى الكامل مع GSAP و Twemoji مضمّنة
        const fullHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            margin: 0; 
            padding: 0; 
            overflow: hidden;
            font-family: 'Noto Sans Arabic', 'Noto Sans', sans-serif;
        }
        ${css}
    </style>
</head>
<body>
    ${htmlClean}
    <script>
        // GSAP مضمّنة محلياً
        ${this.gsapCode}
    </script>
    <script>
        // Twemoji مضمّنة محلياً
        ${this.twemojiCode}
    </script>
    <script>
        try {
            ${js}
        } catch (error) {
            console.error('JavaScript Error:', error);
        }
        // تحويل الإيموجي إلى SVG
        if (typeof twemoji !== 'undefined') {
            twemoji.parse(document.body, {
                folder: 'svg',
                ext: '.svg'
            });
        }
    </script>
</body>
</html>`;

        // تحديث iframe
        try {
            const blob = new Blob([fullHTML], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            
            this.preview.onload = () => {
                this.hideLoading();
                // تنظيف URL القديم
                if (this.preview.src.startsWith('blob:')) {
                    URL.revokeObjectURL(this.preview.src);
                }
            };

            this.preview.src = url;
        } catch (error) {
            console.error('Preview Error:', error);
            this.hideLoading();
        }
    }

    showLoading() {
        this.previewLoading.classList.add('active');
    }

    hideLoading() {
        setTimeout(() => {
            this.previewLoading.classList.remove('active');
        }, 300);
    }

    restartPreview() {
        // إعادة تحميل المعاينة لإعادة تشغيل الأنيميشن
        this.updatePreview();
    }
}

// تهيئة المعاينة عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    window.previewManager = new PreviewManager();
});
