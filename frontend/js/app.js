// منطق التطبيق الرئيسي
class App {
    constructor() {
        this.htmlEditor = document.getElementById('html-editor');
        this.cssEditor = document.getElementById('css-editor');
        this.jsEditor = document.getElementById('js-editor');
        this.durationInput = document.getElementById('duration');
        this.fpsSelect = document.getElementById('fps');
        this.formatSelect = document.getElementById('format');
        this.resolutionSelect = document.getElementById('resolution');
        
        this.init();
    }

    init() {
        this.initTabs();
        this.initClearButtons();
        this.initTemplates();
        this.initEstimates();
        this.loadFromLocalStorage();
        this.initAutoSave();
    }

    // تهيئة نظام التبويبات
    initTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const editors = document.querySelectorAll('.editor-wrapper');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;

                // تحديث أزرار التبويب
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // تحديث المحررات
                editors.forEach(e => {
                    if (e.dataset.editor === tab) {
                        e.classList.add('active');
                    } else {
                        e.classList.remove('active');
                    }
                });
            });
        });
    }

    // تهيئة أزرار المسح
    initClearButtons() {
        const clearBtns = document.querySelectorAll('.clear-btn');

        clearBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const editor = btn.dataset.clear;
                const editorElement = document.getElementById(`${editor}-editor`);
                
                if (confirm(`هل أنت متأكد من مسح كود ${editor.toUpperCase()}؟`)) {
                    editorElement.value = '';
                    // تحديث المعاينة
                    if (window.previewManager) {
                        window.previewManager.updatePreview();
                    }
                    this.saveToLocalStorage();
                }
            });
        });
    }

    // تهيئة القوالب الجاهزة
    initTemplates() {
        const templateBtns = document.querySelectorAll('.template-btn');

        templateBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const templateName = btn.dataset.template;
                const template = templates[templateName];

                if (template) {
                    if (confirm(`هل تريد تحميل قالب "${template.name}"؟\nسيتم استبدال الكود الحالي.`)) {
                        this.loadTemplate(template);
                    }
                }
            });
        });
    }

    loadTemplate(template) {
        this.htmlEditor.value = template.html;
        this.cssEditor.value = template.css;
        this.jsEditor.value = template.js;

        // تحديث المعاينة
        if (window.previewManager) {
            window.previewManager.updatePreview();
        }

        // حفظ في التخزين المحلي
        this.saveToLocalStorage();

        // إظهار إشعار
        this.showNotification(`تم تحميل قالب "${template.name}" ✅`);
    }

    // تحديث التقديرات
    initEstimates() {
        [this.durationInput, this.fpsSelect, this.formatSelect, this.resolutionSelect].forEach(element => {
            element.addEventListener('change', () => this.updateEstimates());
        });

        // تحديث أولي
        this.updateEstimates();
    }

    updateEstimates() {
        const duration = parseInt(this.durationInput.value) || 15;
        const fps = parseInt(this.fpsSelect.value) || 30;
        const format = this.formatSelect.value;
        const resolution = this.resolutionSelect.value;

        // عدد الإطارات
        const totalFrames = duration * fps;
        document.getElementById('total-frames').textContent = totalFrames;

        // حجم تقريبي (MB)
        let estimatedSize;
        if (format === 'MP4') {
            const sizeMultiplier = resolution === 'HD_Horizontal' ? 2 : 1.5;
            estimatedSize = (duration * sizeMultiplier).toFixed(0);
        } else {
            estimatedSize = (duration * 3).toFixed(0);
        }
        document.getElementById('estimated-size').textContent = estimatedSize;

        // وقت المعالجة التقريبي
        const baseTime = {
            'HD_Vertical': 3,
            'Square': 2.5,
            'HD_Horizontal': 3
        }[resolution] || 3;

        const estimatedTime = Math.round(duration * baseTime);
        document.getElementById('estimated-time').textContent = estimatedTime;
    }

    // حفظ تلقائي في التخزين المحلي
    initAutoSave() {
        [this.htmlEditor, this.cssEditor, this.jsEditor].forEach(editor => {
            editor.addEventListener('input', () => {
                this.debouncedSave();
            });
        });
    }

    debouncedSave() {
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
            this.saveToLocalStorage();
        }, 2000); // حفظ بعد ثانيتين من التوقف عن الكتابة
    }

    saveToLocalStorage() {
        try {
            const data = {
                html: this.htmlEditor.value,
                css: this.cssEditor.value,
                js: this.jsEditor.value,
                timestamp: Date.now()
            };
            localStorage.setItem('webToVideoCode', JSON.stringify(data));
        } catch (error) {
            console.error('خطأ في الحفظ:', error);
        }
    }

    loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem('webToVideoCode');
            if (saved) {
                const data = JSON.parse(saved);
                
                // تحميل الكود المحفوظ
                if (data.html) this.htmlEditor.value = data.html;
                if (data.css) this.cssEditor.value = data.css;
                if (data.js) this.jsEditor.value = data.js;

                // تحديث المعاينة
                if (window.previewManager) {
                    setTimeout(() => {
                        window.previewManager.updatePreview();
                    }, 100);
                }

                console.log('تم تحميل الكود المحفوظ');
            }
        } catch (error) {
            console.error('خطأ في التحميل:', error);
        }
    }

    // إظهار إشعار
    showNotification(message, duration = 3000) {
        // إنشاء عنصر الإشعار
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 2rem;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(16, 185, 129, 0.9);
            color: white;
            padding: 1rem 2rem;
            border-radius: 0.5rem;
            font-weight: 600;
            z-index: 1000;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
            animation: slideUp 0.3s ease;
        `;

        document.body.appendChild(notification);

        // إزالة بعد المدة المحددة
        setTimeout(() => {
            notification.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, duration);
    }

    // حفظ الكود الحالي كملف
    exportCode() {
        const code = {
            html: this.htmlEditor.value,
            css: this.cssEditor.value,
            js: this.jsEditor.value
        };

        const blob = new Blob([JSON.stringify(code, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `code_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        this.showNotification('تم تصدير الكود ✅');
    }

    // استيراد كود من ملف
    importCode(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const code = JSON.parse(e.target.result);
                this.htmlEditor.value = code.html || '';
                this.cssEditor.value = code.css || '';
                this.jsEditor.value = code.js || '';

                if (window.previewManager) {
                    window.previewManager.updatePreview();
                }

                this.showNotification('تم استيراد الكود ✅');
            } catch (error) {
                this.showNotification('خطأ في قراءة الملف ❌');
            }
        };
        reader.readAsText(file);
    }
}

// إضافة أنيميشن CSS للإشعارات
const style = document.createElement('style');
style.textContent = `
    @keyframes slideUp {
        from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    }

    @keyframes fadeOut {
        to {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
        }
    }
`;
document.head.appendChild(style);

// تهيئة التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
    console.log('✅ التطبيق جاهز!');
});

// اختصارات لوحة المفاتيح
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + S: حفظ
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (window.app) {
            window.app.saveToLocalStorage();
            window.app.showNotification('تم الحفظ ✅', 1500);
        }
    }

    // Ctrl/Cmd + Enter: تحويل
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        const convertBtn = document.getElementById('convert-btn');
        if (convertBtn && !convertBtn.disabled) {
            convertBtn.click();
        }
    }
});

// منع فقدان البيانات عند إغلاق الصفحة
window.addEventListener('beforeunload', (e) => {
    const hasCode = document.getElementById('html-editor').value.trim() ||
                    document.getElementById('css-editor').value.trim() ||
                    document.getElementById('js-editor').value.trim();

    if (hasCode) {
        if (window.app) {
            window.app.saveToLocalStorage();
        }
        // رسالة تحذير (في بعض المتصفحات)
        e.preventDefault();
        e.returnValue = '';
    }
});
