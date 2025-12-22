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
        this.lottieCode = '';
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
            // تحميل GSAP و Twemoji و Lottie بالتوازي
            const [gsapResponse, twemojiResponse, lottieResponse] = await Promise.all([
                fetch('/api/libs/gsap.js'),
                fetch('/api/libs/twemoji.js'),
                fetch('/api/libs/lottie.js')
            ]);
            
            if (gsapResponse.ok) {
                this.gsapCode = await gsapResponse.text();
                console.log('✅ GSAP loaded for preview');
            }
            
            if (twemojiResponse.ok) {
                this.twemojiCode = await twemojiResponse.text();
                console.log('✅ Twemoji loaded for preview');
            }
            
            if (lottieResponse.ok) {
                this.lottieCode = await lottieResponse.text();
                console.log('✅ Lottie loaded for preview');
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

        // Virtual Time Controller - نظام الوقت الافتراضي للتحكم الدقيق
        const virtualTimeController = `
        (function() {
            // Virtual Time System
            window.__virtualTime = 0;
            window.__isRecording = false;
            window.__animationCallbacks = [];
            
            // دالة تسجيل callback للأنيميشن
            window.registerAnimation = function(callback) {
                window.__animationCallbacks.push(callback);
            };
            
            // دالة الانتقال لوقت معين (بالملي ثانية)
            window.seekToTime = function(timeMs) {
                window.__virtualTime = timeMs;
                window.__isRecording = true;
                
                // استدعاء كل callbacks مسجلة
                window.__animationCallbacks.forEach(function(cb) {
                    try { cb(timeMs); } catch(e) { console.error(e); }
                });
                
                // إيقاف CSS animations وضبط الوقت
                document.querySelectorAll('*').forEach(function(el) {
                    var style = window.getComputedStyle(el);
                    if (style.animationName && style.animationName !== 'none') {
                        el.style.animationPlayState = 'paused';
                        el.style.animationDelay = '-' + (timeMs / 1000) + 's';
                    }
                });
                
                // GSAP timeline control
                if (window.gsap && window.gsap.globalTimeline) {
                    window.gsap.globalTimeline.pause();
                    window.gsap.globalTimeline.seek(timeMs / 1000);
                }
                
                // Lottie control
                if (window.__lottieAnimations) {
                    window.__lottieAnimations.forEach(function(anim) {
                        anim.goToAndStop(timeMs, false);
                    });
                }
            };
            
            // دالة استئناف الأنيميشن
            window.resumeAnimations = function() {
                window.__isRecording = false;
                document.querySelectorAll('*').forEach(function(el) {
                    el.style.animationPlayState = '';
                    el.style.animationDelay = '';
                });
                if (window.gsap && window.gsap.globalTimeline) {
                    window.gsap.globalTimeline.resume();
                }
            };
            
            // الحصول على الوقت الحالي
            window.getVirtualTime = function() {
                if (window.__isRecording) {
                    return window.__virtualTime;
                }
                return performance.now();
            };
            
            // تخزين Lottie animations
            window.__lottieAnimations = [];
            window.registerLottie = function(anim) {
                window.__lottieAnimations.push(anim);
            };
            
            // Hook قبل الالتقاط - انتظار الخطوط والصور
            window.__capturePrepare = async function() {
                // 1) انتظر تحميل الخطوط
                if (document.fonts && document.fonts.ready) {
                    await document.fonts.ready;
                }
                
                // 2) انتظر الصور (Twemoji يحول الإيموجي إلى <img>)
                var imgs = Array.from(document.images || []);
                await Promise.all(imgs.map(function(img) {
                    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
                    return new Promise(function(res) {
                        img.onload = function() { res(); };
                        img.onerror = function() { res(); };
                    });
                }));
                
                // 3) أعطِ المتصفح فريمين لتثبيت الـ layout
                await new Promise(function(r) {
                    requestAnimationFrame(function() {
                        requestAnimationFrame(r);
                    });
                });
            };
            
            // تفعيل/تعطيل وضع الالتقاط (يزيل backdrop-filter)
            window.setCaptureMode = function(on) {
                document.documentElement.classList.toggle('capture-mode', !!on);
            };
        })();
        `;

        // إنشاء المحتوى الكامل مع GSAP و Twemoji مضمّنة
        const fullHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { 
            width: 100%;
            height: 100%;
            margin: 0; 
            padding: 0; 
            overflow: hidden;
            font-family: 'Noto Sans Arabic', 'Noto Sans', sans-serif;
        }
        img.emoji {
            height: 1em;
            width: 1em;
            margin: 0 0.05em 0 0.1em;
            vertical-align: -0.1em;
            display: inline-block;
        }
        /* وضع الالتقاط - تعطيل backdrop-filter لتوافق html2canvas */
        html.capture-mode *,
        html.capture-mode .card,
        html.capture-mode [class*="glass"],
        html.capture-mode [class*="blur"] {
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
        }
        ${css}
    </style>
</head>
<body>
    ${htmlClean}
    <script>
        // Virtual Time Controller - يجب أن يكون أول شيء
        ${virtualTimeController}
    </script>
    <script>
        // GSAP مضمّنة محلياً
        ${this.gsapCode}
    </script>
    <script>
        // Twemoji مضمّنة محلياً
        ${this.twemojiCode}
    </script>
    <script>
        // Lottie مضمّنة محلياً (لأنيميشنات After Effects)
        ${this.lottieCode}
    </script>
    <script>
        try {
            ${js}
        } catch (error) {
            console.error('JavaScript Error:', error);
        }
        // تحويل الإيموجي إلى SVG (jsDelivr يدعم CORS)
        if (typeof twemoji !== 'undefined') {
            twemoji.parse(document.body, {
                folder: 'svg',
                ext: '.svg',
                base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/'
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
            
            // تحديث أيضاً الـ iframe المخفي للتصوير
            this.updateCaptureFrame(fullHTML);
        } catch (error) {
            console.error('Preview Error:', error);
            this.hideLoading();
        }
    }
    
    updateCaptureFrame(fullHTML) {
        const captureFrame = document.getElementById('preview-frame');
        if (captureFrame) {
            const resolution = this.resolutionSelect.value;
            const resolutions = {
                'HD_Vertical': { width: 1080, height: 1920 },
                'Square': { width: 1080, height: 1080 },
                'HD_Horizontal': { width: 1920, height: 1080 }
            };
            const res = resolutions[resolution] || resolutions['HD_Vertical'];
            
            captureFrame.style.width = res.width + 'px';
            captureFrame.style.height = res.height + 'px';
            
            const blob = new Blob([fullHTML], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            captureFrame.src = url;
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
