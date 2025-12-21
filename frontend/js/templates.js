// القوالب الجاهزة
const templates = {
    gradient: {
        name: 'تدرج متحرك',
        html: `<div class="gradient-container">
    <div class="gradient-box"></div>
    <h1 class="text">تدرج متحرك</h1>
</div>`,
        css: `body {
    margin: 0;
    padding: 0;
    overflow: hidden;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    background: #000;
}

.gradient-container {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
}

.gradient-box {
    position: absolute;
    width: 400px;
    height: 400px;
    border-radius: 50%;
    background: linear-gradient(45deg, #667eea, #764ba2, #f093fb, #4facfe);
    background-size: 400% 400%;
    animation: gradientMove 8s ease infinite;
    filter: blur(40px);
    opacity: 0.8;
}

.text {
    position: relative;
    z-index: 10;
    font-size: 4rem;
    font-weight: bold;
    color: white;
    text-align: center;
    text-shadow: 0 0 30px rgba(255, 255, 255, 0.5);
    animation: pulse 2s ease-in-out infinite;
}

@keyframes gradientMove {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}

@keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
}`,
        js: ''
    },

    particles: {
        name: 'جزيئات متحركة',
        html: `<div class="particles-container">
    <canvas id="particlesCanvas"></canvas>
    <h1 class="overlay-text">جزيئات متحركة</h1>
</div>`,
        css: `body {
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
}

.particles-container {
    position: relative;
    width: 100%;
    height: 100vh;
}

#particlesCanvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
}

.overlay-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 3.5rem;
    font-weight: bold;
    color: white;
    z-index: 10;
    text-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
}`,
        js: `const canvas = document.getElementById('particlesCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Deterministic Particle System
class Particle {
    constructor(seed) {
        this.seed = seed;
        this.initX = this.seededRandom(seed) * canvas.width;
        this.initY = this.seededRandom(seed + 1) * canvas.height;
        this.size = this.seededRandom(seed + 2) * 3 + 1;
        this.speedX = this.seededRandom(seed + 3) * 3 - 1.5;
        this.speedY = this.seededRandom(seed + 4) * 3 - 1.5;
        this.color = 'rgba(255, 255, 255, 0.8)';
    }

    seededRandom(s) {
        const x = Math.sin(s * 9999) * 10000;
        return x - Math.floor(x);
    }

    getPosition(timeMs) {
        const t = timeMs / 1000;
        let x = this.initX + this.speedX * t * 60;
        let y = this.initY + this.speedY * t * 60;
        
        // Bounce logic
        const bounceX = Math.floor(x / canvas.width);
        const bounceY = Math.floor(y / canvas.height);
        x = x % canvas.width;
        y = y % canvas.height;
        if (x < 0) x += canvas.width;
        if (y < 0) y += canvas.height;
        if (bounceX % 2 !== 0) x = canvas.width - x;
        if (bounceY % 2 !== 0) y = canvas.height - y;
        
        return { x, y };
    }

    draw(timeMs) {
        const pos = this.getPosition(timeMs);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        return pos;
    }
}

const particles = [];
for (let i = 0; i < 100; i++) {
    particles.push(new Particle(i * 5));
}

function renderFrame(timeMs) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const positions = particles.map(p => p.draw(timeMs));

    // رسم الخطوط بين الجزيئات القريبة
    for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
            const dx = positions[i].x - positions[j].x;
            const dy = positions[i].y - positions[j].y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 100) {
                ctx.strokeStyle = 'rgba(255, 255, 255, ' + (1 - distance / 100) * 0.3 + ')';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(positions[i].x, positions[i].y);
                ctx.lineTo(positions[j].x, positions[j].y);
                ctx.stroke();
            }
        }
    }
}

// تسجيل callback للتسجيل
if (window.registerAnimation) {
    window.registerAnimation(renderFrame);
}

// تشغيل في الوضع العادي
let startTime = null;
function animate(timestamp) {
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;
    
    // في وضع التسجيل، لا نحدث
    if (!window.__isRecording) {
        renderFrame(elapsed);
    }
    
    requestAnimationFrame(animate);
}

requestAnimationFrame(animate);`
    },

    text: {
        name: 'نص متحرك',
        html: `<div class="text-container">
    <div class="animated-text">
        <span>م</span>
        <span>ر</span>
        <span>ح</span>
        <span>ب</span>
        <span>اً</span>
    </div>
</div>`,
        css: `body {
    margin: 0;
    padding: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    overflow: hidden;
}

.text-container {
    text-align: center;
}

.animated-text {
    display: inline-flex;
    gap: 0.5rem;
}

.animated-text span {
    display: inline-block;
    font-size: 5rem;
    font-weight: bold;
    color: white;
    text-shadow: 0 0 30px rgba(255, 255, 255, 0.5);
    animation: wave 2s ease-in-out infinite;
    animation-delay: calc(var(--i) * 0.1s);
}

.animated-text span:nth-child(1) { --i: 0; }
.animated-text span:nth-child(2) { --i: 1; }
.animated-text span:nth-child(3) { --i: 2; }
.animated-text span:nth-child(4) { --i: 3; }
.animated-text span:nth-child(5) { --i: 4; }

@keyframes wave {
    0%, 100% {
        transform: translateY(0) scale(1);
    }
    25% {
        transform: translateY(-30px) scale(1.2);
    }
    50% {
        transform: translateY(0) scale(1);
    }
    75% {
        transform: translateY(-15px) scale(1.1);
    }
}`,
        js: ''
    },

    shapes: {
        name: 'أشكال متحركة',
        html: `<div class="shapes-container">
    <div class="shape shape-1"></div>
    <div class="shape shape-2"></div>
    <div class="shape shape-3"></div>
    <div class="shape shape-4"></div>
    <h1 class="center-text">أشكال متحركة</h1>
</div>`,
        css: `body {
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: #0f172a;
}

.shapes-container {
    position: relative;
    width: 100%;
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
}

.shape {
    position: absolute;
    border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%;
    filter: blur(30px);
    opacity: 0.6;
}

.shape-1 {
    width: 300px;
    height: 300px;
    background: linear-gradient(135deg, #667eea, #764ba2);
    animation: morph1 8s ease-in-out infinite, move1 10s ease-in-out infinite;
}

.shape-2 {
    width: 250px;
    height: 250px;
    background: linear-gradient(135deg, #f093fb, #f5576c);
    animation: morph2 7s ease-in-out infinite, move2 12s ease-in-out infinite;
}

.shape-3 {
    width: 200px;
    height: 200px;
    background: linear-gradient(135deg, #4facfe, #00f2fe);
    animation: morph3 9s ease-in-out infinite, move3 11s ease-in-out infinite;
}

.shape-4 {
    width: 280px;
    height: 280px;
    background: linear-gradient(135deg, #43e97b, #38f9d7);
    animation: morph4 6s ease-in-out infinite, move4 13s ease-in-out infinite;
}

.center-text {
    position: relative;
    z-index: 10;
    font-size: 3.5rem;
    font-weight: bold;
    color: white;
    text-shadow: 0 0 30px rgba(255, 255, 255, 0.5);
}

@keyframes morph1 {
    0%, 100% { border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%; }
    50% { border-radius: 70% 30% 30% 70% / 70% 70% 30% 30%; }
}

@keyframes morph2 {
    0%, 100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
    50% { border-radius: 40% 60% 70% 30% / 40% 70% 30% 60%; }
}

@keyframes morph3 {
    0%, 100% { border-radius: 40% 60% 60% 40% / 60% 40% 40% 60%; }
    50% { border-radius: 60% 40% 40% 60% / 40% 60% 60% 40%; }
}

@keyframes morph4 {
    0%, 100% { border-radius: 50% 50% 30% 70% / 50% 60% 40% 50%; }
    50% { border-radius: 50% 50% 70% 30% / 50% 40% 60% 50%; }
}

@keyframes move1 {
    0%, 100% { transform: translate(0, 0) rotate(0deg); }
    25% { transform: translate(100px, -100px) rotate(90deg); }
    50% { transform: translate(0, -200px) rotate(180deg); }
    75% { transform: translate(-100px, -100px) rotate(270deg); }
}

@keyframes move2 {
    0%, 100% { transform: translate(0, 0) rotate(0deg); }
    25% { transform: translate(-150px, 100px) rotate(-90deg); }
    50% { transform: translate(0, 200px) rotate(-180deg); }
    75% { transform: translate(150px, 100px) rotate(-270deg); }
}

@keyframes move3 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(200px, 0) scale(1.3); }
}

@keyframes move4 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(-200px, 0) scale(1.2); }
}`,
        js: ''
    }
};

// تصدير القوالب
if (typeof module !== 'undefined' && module.exports) {
    module.exports = templates;
}
