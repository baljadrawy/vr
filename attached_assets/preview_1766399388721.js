// معاينة مباشرة للكود - نسخة محسّنة ✅
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
        this.debounceDelay = 1000;
        
        // 🔧 تخزين URLs لتنظيفها
        this.currentPreviewURL = null;
        this.currentCaptureURL = null;
        
        this.gsapCode = '';
        this.twemojiCode = '';
        this.lottieCode = '';
        this.librariesLoaded = false;

        this.init();
    }

    async init() {
        await this.loadLibraries();
        
        [this.htmlEditor, this.cssEditor, this.jsEditor].forEach(editor => {
            editor.addEventListener('input', () => this.debouncedUpdate());
        });

        this.resolutionSelect.addEventListener('change', () => {
            this.updateResolutionDisplay();
            this.updatePreview();
        });

        this.refreshBtn.addEventListener('click', () => this.updatePreview());
        this.restartBtn.addEventListener('click', () => this.restartPreview());

        this.updateResolutionDisplay();
        this.updatePreview();
    }
    
    async loadLibraries() {
        try {
            const [gsapResponse, twemojiResponse, lottieResponse] = await Promise.all([
                fetch('/api/libs/gsap.js'),
                fetch('/api/libs/twemoji.js'),
                fetch('/api/libs/lottie.js')
            ]);
            
            if (gsapResponse.ok) this.gsapCode = await gsapResponse.text();
            if (twemojiResponse.ok) this.twemojiCode = await twemojiResponse.text();
            if (lottieResponse.ok) this.lottieCode = await lottieResponse.text();
            
            this.librariesLoaded = true;
            console.log('✅ Libraries loaded');
        } catch (error) {
            console.error('Error loading libraries:', error);
            this.librariesLoaded = true;
        }
    }

    debouncedUpdate() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.updatePreview(), this.debounceDelay);
    }

    updateResolutionDisplay() {
        const resolutions = {
            'HD_Vertical': { width: 1080, height: 1920, class: 'vertical' },
            'Square': { width: 1080, height: 1080, class: 'square' },
            'HD_Horizontal': { width: 1920, height: 1080, class: 'horizontal' }
        };

        const selected = resolutions[this.resolutionSelect.value];
        this.resolutionIndicator.textContent = `${selected.width} × ${selected.height}`;
        document.querySelector('.preview-container').className = 'preview-container ' + selected.class;
    }

    buildFullHTML(html, css, js) {
        const scriptRegex = /<script\s+src=["'][^"']*gsap[^"']*["'][^>]*>\s*<\/script>/gi;
        const htmlClean = html.replace(scriptRegex, '');

        const virtualTimeController = `
(function() {
    window.__virtualTime = 0;
    window.__isRecording = false;
    window.__animationCallbacks = [];
    window.__lottieAnimations = [];
    
    window.registerAnimation = function(cb) { window.__animationCallbacks.push(cb); };
    
    window.seekToTime = function(timeMs) {
        window.__virtualTime = timeMs;
        window.__isRecording = true;
        
        window.__animationCallbacks.forEach(cb => { try { cb(timeMs); } catch(e) {} });
        
        document.querySelectorAll('*').forEach(el => {
            const style = getComputedStyle(el);
            if (style.animationName && style.animationName !== 'none') {
                el.style.animationPlayState = 'paused';
                el.style.animationDelay = '-' + (timeMs / 1000) + 's';
            }
        });
        
        if (window.gsap) {
            try {
                gsap.globalTimeline.getChildren().forEach(tl => {
                    tl.pause();
                    tl.seek(timeMs / 1000);
                });
            } catch(e) {}
        }
        
        window.__lottieAnimations.forEach(anim => {
            try { anim.goToAndStop(timeMs, false); } catch(e) {}
        });
    };
    
    window.resumeAnimations = function() {
        window.__isRecording = false;
        document.querySelectorAll('*').forEach(el => {
            el.style.animationPlayState = '';
            el.style.animationDelay = '';
        });
        if (window.gsap) try { gsap.globalTimeline.resume(); } catch(e) {}
    };
    
    window.getVirtualTime = () => window.__isRecording ? window.__virtualTime : performance.now();
    window.registerLottie = anim => window.__lottieAnimations.push(anim);
    
    window.__capturePrepare = async function() {
        if (document.fonts?.ready) await document.fonts.ready.catch(() => {});
        
        const imgs = Array.from(document.images || []);
        await Promise.all(imgs.map(img => {
            if (img.complete && img.naturalWidth > 0) return Promise.resolve();
            return new Promise(res => {
                const timeout = setTimeout(res, 2000);
                img.onload = () => { clearTimeout(timeout); res(); };
                img.onerror = () => { clearTimeout(timeout); res(); };
            });
        }));
        
        await new Promise(r => requestAnimationFrame(() => 
            requestAnimationFrame(() => requestAnimationFrame(r))
        ));
    };
    
    window.setCaptureMode = function(on) {
        if (on) {
            document.documentElement.classList.add('capture-mode');
            document.querySelectorAll('*').forEach(el => {
                const style = getComputedStyle(el);
                if (style.backdropFilter && style.backdropFilter !== 'none') {
                    el.setAttribute('data-backdrop', style.backdropFilter);
                    el.style.backdropFilter = 'none';
                    el.style.webkitBackdropFilter = 'none';
                }
            });
        } else {
            document.documentElement.classList.remove('capture-mode');
            document.querySelectorAll('[data-backdrop]').forEach(el => {
                const orig = el.getAttribute('data-backdrop');
                el.style.backdropFilter = orig;
                el.style.webkitBackdropFilter = orig;
                el.removeAttribute('data-backdrop');
            });
        }
    };
})();`;

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { 
            width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden;
            font-family: 'Noto Sans Arabic', 'Noto Sans', sans-serif;
        }
        img.emoji { height: 1em; width: 1em; margin: 0 0.05em 0 0.1em; vertical-align: -0.1em; display: inline-block; }
        html.capture-mode *, html.capture-mode .card, html.capture-mode [class*="glass"], html.capture-mode [class*="blur"] {
            backdrop-filter: none !important; -webkit-backdrop-filter: none !important;
        }
        ${css}
    </style>
</head>
<body>
    ${htmlClean}
    <script>${virtualTimeController}</script>
    <script>${this.gsapCode}</script>
    <script>${this.twemojiCode}</script>
    <script>${this.lottieCode}</script>
    <script>
        try { ${js} } catch (e) { console.error('JS Error:', e); }
        if (typeof twemoji !== 'undefined') {
            twemoji.parse(document.body, {
                folder: 'svg', ext: '.svg',
                base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/'
            });
        }
    </script>
</body>
</html>`;
    }

    updatePreview() {
        const fullHTML = this.buildFullHTML(
            this.htmlEditor.value,
            this.cssEditor.value,
            this.jsEditor.value
        );

        this.showLoading();

        try {
            // 🔧 تنظيف URL القديم
            if (this.currentPreviewURL) {
                URL.revokeObjectURL(this.currentPreviewURL);
            }

            const blob = new Blob([fullHTML], { type: 'text/html' });
            this.currentPreviewURL = URL.createObjectURL(blob);
            this.preview.src = this.currentPreviewURL;
            
            setTimeout(() => this.hideLoading(), 300);
            this.updateCaptureFrame(fullHTML);
            
        } catch (error) {
            console.error('Preview Error:', error);
            this.hideLoading();
        }
    }
    
    updateCaptureFrame(fullHTML) {
        const captureFrame = document.getElementById('preview-frame');
        if (!captureFrame) return;
        
        const resolutions = {
            'HD_Vertical': { width: 1080, height: 1920 },
            'Square': { width: 1080, height: 1080 },
            'HD_Horizontal': { width: 1920, height: 1080 }
        };
        const res = resolutions[this.resolutionSelect.value] || resolutions['HD_Vertical'];
        
        captureFrame.style.width = res.width + 'px';
        captureFrame.style.height = res.height + 'px';
        
        // 🔧 تنظيف URL القديم
        if (this.currentCaptureURL) {
            URL.revokeObjectURL(this.currentCaptureURL);
        }
        
        const blob = new Blob([fullHTML], { type: 'text/html' });
        this.currentCaptureURL = URL.createObjectURL(blob);
        captureFrame.src = this.currentCaptureURL;
    }

    showLoading() { this.previewLoading.classList.add('active'); }
    hideLoading() { this.previewLoading.classList.remove('active'); }
    restartPreview() { this.updatePreview(); }
}

document.addEventListener('DOMContentLoaded', () => {
    window.previewManager = new PreviewManager();
});
