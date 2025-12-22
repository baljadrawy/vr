const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    
    if (req.path.endsWith('.wasm')) {
        res.setHeader('Content-Type', 'application/wasm');
    }
    
    next();
});

app.use(express.static(path.join(__dirname, 'frontend')));

app.use('/animations', express.static(path.join(__dirname, 'animations')));
app.use('/output', express.static(path.join(__dirname, 'output')));

const LIBS_DIR = path.join(__dirname, 'node_modules');

app.get('/api/libs/gsap.js', (req, res) => {
    const gsapPath = path.join(LIBS_DIR, 'gsap', 'dist', 'gsap.min.js');
    if (fs.existsSync(gsapPath)) {
        res.type('application/javascript').sendFile(gsapPath);
    } else {
        res.status(404).send('// GSAP not found');
    }
});

app.get('/api/libs/twemoji.js', (req, res) => {
    const twemojiPath = path.join(LIBS_DIR, 'twemoji', 'dist', 'twemoji.min.js');
    if (fs.existsSync(twemojiPath)) {
        res.type('application/javascript').sendFile(twemojiPath);
    } else {
        res.status(404).send('// Twemoji not found');
    }
});

app.get('/api/libs/lottie.js', (req, res) => {
    const lottiePath = path.join(LIBS_DIR, 'lottie-web', 'build', 'player', 'lottie.min.js');
    if (fs.existsSync(lottiePath)) {
        res.type('application/javascript').sendFile(lottiePath);
    } else {
        res.status(404).send('// Lottie not found');
    }
});

app.get('/api/animations/list', (req, res) => {
    const animDir = path.join(__dirname, 'animations');
    try {
        if (!fs.existsSync(animDir)) {
            fs.mkdirSync(animDir, { recursive: true });
        }
        const files = fs.readdirSync(animDir).filter(f => f.endsWith('.json'));
        const animations = files.map(filename => ({
            name: filename.replace('.json', ''),
            filename,
            url: `/animations/${filename}`
        }));
        res.json({ success: true, animations });
    } catch (error) {
        res.json({ success: false, error: error.message, animations: [] });
    }
});

app.post('/api/animations/upload', express.json({ limit: '10mb' }), (req, res) => {
    const { name, data } = req.body;
    if (!name || !data) {
        return res.status(400).json({ success: false, error: 'Missing name or data' });
    }
    
    const animDir = path.join(__dirname, 'animations');
    if (!fs.existsSync(animDir)) {
        fs.mkdirSync(animDir, { recursive: true });
    }
    
    const filename = name.endsWith('.json') ? name : `${name}.json`;
    const filepath = path.join(animDir, filename);
    
    try {
        fs.writeFileSync(filepath, data);
        res.json({ success: true, filename });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/animations/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(__dirname, 'animations', filename);
    
    try {
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, error: 'File not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎬 Web to Video Converter (WASM Edition)`);
    console.log(`🌐 Server running at http://0.0.0.0:${PORT}`);
    console.log(`✅ All video processing happens in the browser!`);
});
