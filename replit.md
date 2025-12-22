# محول كود الويب إلى فيديو | Web to Video Converter

## نظرة عامة
تطبيق ويب بواجهة عربية يحوّل أكواد HTML/CSS/JavaScript إلى فيديوهات MP4 أو GIF. مثالي لإنشاء محتوى Reels و TikTok و Stories.

**النسخة 2.3** - كل المعالجة تتم في المتصفح باستخدام FFmpeg.wasm 0.12.10

---

## المميزات

### الأساسية
- واجهة عربية كاملة (RTL)
- محرر كود متعدد التبويبات (HTML, CSS, JavaScript)
- معاينة مباشرة
- قوالب جاهزة: تدرجات، جزيئات، نصوص، أشكال، **مشاهد متعددة**

### معالجة في المتصفح
- **FFmpeg.wasm 0.12.10** - تشفير الفيديو بالكامل في المتصفح
- **html2canvas** - التقاط الإطارات من المعاينة
- **بدون سيرفر ثقيل** - السيرفر يخدم الملفات الثابتة فقط
- **خصوصية** - الكود لا يُرسل لأي سيرفر

### خيارات الإخراج
- **الدقة:** عمودي (1080×1920) | مربع (1080×1080) | أفقي (1920×1080)
- **التنسيق:** MP4 أو GIF
- **المدة:** 1-20 ثانية
- **FPS:** 24, 30, 60

---

## هيكل المشروع

```
├── server.js                  # سيرفر Express
├── frontend/
│   ├── index.html             # الصفحة الرئيسية
│   ├── css/style.css          # التنسيقات
│   ├── js/
│   │   ├── app.js             # المنطق الرئيسي
│   │   ├── api-wasm.js        # إدارة التحويل
│   │   ├── video-generator.js # منشئ الفيديو (FFmpeg.wasm)
│   │   ├── preview.js         # إدارة المعاينة
│   │   └── templates.js       # القوالب الجاهزة
│   └── libs/ffmpeg/           # ملفات FFmpeg.wasm
└── animations/                # أنيميشنات Lottie
```

---

## كيف يعمل

1. المستخدم يكتب الكود ويختار الإعدادات
2. عند التحويل:
   - يُحمّل FFmpeg.wasm (~25MB أول مرة)
   - يُلتقط كل إطار باستخدام html2canvas
   - تُشفّر الإطارات على دفعات (4 ثواني)
   - يُدمج الأجزاء في ملف واحد
3. يُحمّل الفيديو للمستخدم

### نظام التزامن للأنيميشن
لتحويل أنيميشن متعدد المشاهد بشكل صحيح، استخدم:
```javascript
if (window.registerAnimation) {
    window.registerAnimation(function(timeMs) {
        // أظهر المشهد المناسب حسب timeMs
    });
}
```

---

## التقنيات

- **FFmpeg.wasm 0.12.10** - single-thread mode
- **html2canvas** - التقاط DOM
- **GSAP** - أنيميشنات JavaScript
- **Lottie** - أنيميشنات After Effects
- **Twemoji** - إيموجي SVG

---

## ملاحظات تقنية

### إعدادات الإنتاج
- JPEG quality: 0.90
- crf: 18-23
- preset: veryfast
- tune: film
- framesPerPart: fps × 4

### للمشاهد المتعددة
- استخدم `data-capture-root` على الحاوية الرئيسية
- استخدم `registerAnimation()` للتزامن مع التقاط الإطارات
- استخدم `position: absolute; inset: 0` للحاويات بدلاً من `height: 100%`

---

## التحديثات الأخيرة (ديسمبر 2025)

### v2.3
- إصلاح تحميل FFmpeg (`FFmpegWASM.FFmpeg` بدلاً من `FFmpeg.FFmpeg`)
- قالب جديد: **مشاهد متعددة (Reels)** مع JavaScript متوافق
- تحسين `settleAfterSeek()` - 3 frames + 50ms
- `setCaptureMode()` لتعطيل backdrop-filter أثناء الالتقاط
- `backgroundColor: '#000000'` لإطارات واضحة
- تنظيف Blob URLs تلقائياً لمنع تسرب الذاكرة

### v2.2
- ترقية FFmpeg.wasm من 0.11.x إلى 0.12.10
- Single-Thread Mode (بدون COOP/COEP)
- API جديد: `exec()`, `writeFile()`, `readFile()`

### v2.1
- معالجة الإطارات على دفعات (حل OOM)
- JPEG بدل PNG (~70% أقل ذاكرة)
- دمج الأجزاء بدون إعادة ترميز
