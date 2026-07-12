const fontLink = document.createElement('link');
fontLink.rel = 'stylesheet';
fontLink.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
document.head.appendChild(fontLink);

const style = document.createElement('style');
style.innerHTML = `
    * {
        font-family: 'Press Start 2P', monospace !important;
        text-shadow: none !important;
        box-shadow: none !important;
    }
    body {
        margin: 0;
        padding: 0;
        background-color: #1a1a1a;
        overflow: hidden;
    }
    #share-link-section, #setup-overlay {
        font-family: 'Press Start 2P', monospace !important;
        background-color: #111111 !important;
        border: 6px solid #444444 !important;
        padding: 20px !important;
        color: #ffffff !important;
        text-shadow: none !important;
        box-shadow: none !important;
    }
    #share-url {
        font-family: 'Press Start 2P', monospace !important;
        font-size: 11px !important;
        border: 4px solid #555555 !important;
        background-color: #222222 !important;
        color: #aaffaa !important;
        padding: 8px !important;
        width: 80% !important;
        margin-bottom: 12px !important;
    }
    #setup-overlay button, #share-link-section button {
        border: 4px solid #ffffff !important;
        background-color: #333333 !important;
        color: #ffffff !important;
        font-size: 12px !important;
        padding: 10px 16px !important;
        cursor: pointer !important;
        transition: background 0.1s !important;
    }
    #setup-overlay button:hover, #share-link-section button:hover {
        background-color: #ffffff !important;
        color: #000000 !important;
    }
    #setup-status {
        color: #ffaa00 !important;
        font-size: 12px !important;
        line-height: 1.6 !important;
    }
`;
document.head.appendChild(style);

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

    let fruits = [];
    let particles = [];
    let backgroundSplats = [];
    let sliceRays = [];
    const gravity = 0.13; 
    let spawnIntervalId= null;
    const WINNING_SCORE = 100;
    let gameOver = false;
    let lastCursorSendTime = 0; 
    let backgroundCache = null; 

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    let lastSwingTime = 0;

    const SLOT_COLORS = ['#ff9f00', '#00ffff', '#ff00ff', '#00ff00'];
    let players = {};
    let myId = null;
    let mySlot = 0;
    let isHost = true;
    let peer;
    let conns = {};
    let calls = {};
    let localStream;
    let trackingReady = false;
    let pendingStreams = {};

    function getPlayerCount() {
        return Object.keys(players).length;
    }

    function renderScoreboard() {
        const board = document.getElementById('scoreboard');
        if (!board) return;
        board.innerHTML = '';

        Object.keys(players).forEach(pId =>{
            const player = players[pId];
            const displayLabel = pId === myId ? "YOU" : player.label;
            const scoreBox = document.createElement('div');
            scoreBox.className = 'score-box';
            scoreBox.style.color = player.color;
            scoreBox.style.display = 'flex';
            scoreBox.style.gap = '8px';
            scoreBox.innerHTML = `<span>${displayLabel}:</span><span>${player.score}</span>`;
            board.appendChild(scoreBox);
        });
    }

    function updateVideoSlots() {
        for (let i = 0; i < 4; i++) {
            document.getElementById(`video-slot-${i}`).style.display = 'none';
        }

        Object.keys(players).forEach(pId => {
            const player = players[pId];
            const slotIdx = player.slot;
            const slotEl = document.getElementById(`video-slot-${slotIdx}`);
            const labelEl = document.getElementById(`label-${slotIdx}`);
            const videoEl = document.getElementById(`video-${slotIdx}`);

            if (slotEl && labelEl && videoEl) {
                slotEl.style.display = 'block';
                labelEl.innerText = pId === myId ? "YOU" : player.label;

                if (pId === myId && localStream) {
                    videoEl.srcObject = localStream;
                    videoEl.muted = true;
                }
            }
        });
    }


    const FRUIT_PRESETS = {
        watermelon: { name: 'watermelon', radius: 88, color: '#ff3333', src: 'watermelon.png' },
        pineapple: { name: 'pineapple', radius: 79, color: '#e1b025', src: 'pineapple.png' },
        grape: { name: 'grape', radius: 50, color: '#8a2be2', src: 'grape.png' }, 
        coconut: { name: 'coconut', radius: 48, color: '#8d5524', src: 'coconut.png' },
        banana: { name: 'banana', radius: 40, color: '#ffff33', src: 'banana.png' },
        mango: { name: 'mango', radius: 40, color: '#ffcc00', src: 'mango.png' },
        orange: { name: 'orange', radius: 41, color: '#ff9900', src: 'orange.png' },
        apple: { name: 'apple', radius: 41, color: '#ff2233', src: 'apple.png'},
        bomb: { name: 'bomb', radius: 50, color: '#ff5722', src: 'bomb.png', isBomb: true },
        kiwi: { name: 'kiwi', radius: 25, color: '#66ff66', src: 'kiwi.png' }, 
        strawberry: { name: 'strawberry', radius: 19, color: '#ff2a4b', src: 'strawberry.png'} 
    }

    const preloadedImages = {};
    const imageCrops = {}; 

    function computeOpaqueBounds(img) {
        const off = document.createElement('canvas');
        off.width = img.naturalWidth;
        off.height = img.naturalHeight;
        const octx = off.getContext('2d');
        octx.drawImage(img, 0, 0);
        const { data } = octx.getImageData(0, 0, off.width, off.height);

        let minX = off.width, minY = off.height, maxX = 0, maxY = 0;
        const alphaThreshold = 10;
        for (let y = 0; y < off.height; y++) {
            for (let x = 0; x < off.width; x++) {
                const alpha = data[(y * off.width + x) * 4 + 3];
                if (alpha > alphaThreshold) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }

        if (maxX < minX || maxY < minY) {
            return { sx: 0, sy: 0, sw: off.width, sh: off.height, aspect: off.width / off.height };
        }

        const w = maxX - minX + 1;
        const h = maxY - minY + 1;

        return {
            sx: minX,
            sy: minY,
            sw: w,
            sh: h,
            aspect: w / h
        };
    }

    Object.keys(FRUIT_PRESETS).forEach(key => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = FRUIT_PRESETS[key].src;
        img.onload = () => {
            preloadedImages[key] = img;
            try {
                imageCrops[key] = computeOpaqueBounds(img);
            } catch (e) {
                imageCrops[key] = { sx: 0, sy: 0, sw: img.naturalWidth, sh: img.naturalHeight, aspect: img.naturalWidth / img.naturalHeight };
            }
        };
    });

    function drawFruitImage(img, fruitName, radius) {
        const crop = imageCrops[fruitName];
        const aspect = (crop && crop.aspect) ? crop.aspect : 1.0;
        
        let drawW = radius * 2;
        let drawH = radius * 2;
        if (aspect > 1) {
            drawH = (radius * 2) / aspect;
        } else if (aspect < 1) {
            drawW = (radius * 2) * aspect;
        }

        if (crop) {
            ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, -drawW / 2, -drawH / 2, drawW, drawH);
        } else {
            ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        }
    }

    function playSwingSound() {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(20, audioCtx.currentTime + 0.15);

        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);

    }

    function playSliceSound() {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(650, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(120, audioCtx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    }

    function playExplosionSound() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(10, audioCtx.currentTime + 0.6);

    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.6);
}

function createBombExplosion(x, y) {
    for (let i = 0; i < 18; i++) {
        const angle = Math.random() * 2 * Math.PI;
        const speed = 2 + Math.random() * 6;
        const colors = ['#ff3300', '#ffaa00', '#ffff00', '#555555'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2,
            radius: Math.random() * 4 + 3,
            color,
            alpha: 1.0
        });
    }

    const rayCount = 6;
    for (let i = 0; i < rayCount; i++) {
        sliceRays.push({
            x, y,
            angle: (i * Math.PI * 2) / rayCount,
            length: 120 + Math.random() * 60,
            width: 5 + Math.random() * 3,
            color: '#ffea00',
            alpha: 1.0
        });
    }
}

    function createSplat(x, y, color) {
        for (let i = 0; i < 8; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const speed = 2 + Math.random() * 3;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: Math.random() * 2 + 2,
                color,
                alpha: 1.0
            });
        }

        for (let i = 0; i < 2; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const speed = 1 + Math.random() * 2;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: Math.random() * 1.5 + 1,
                color,
                alpha: 1.0
            });
        }

        const rayCount = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < rayCount; i++) {
            sliceRays.push({
                x, y,
                angle: ( i * Math.PI * 2 ) / rayCount + (Math.random() - 0.5) * 0.25,
                length: 80 + Math.random() * 60,
                width: 2 + Math.random() * 2,
                color,
                alpha: 1.0
            });
        }

    }

    function updatePhysics() {
        for (let i = fruits.length - 1; i >= 0; i--) {
            const fruit = fruits[i];
            
            if (fruit.sliced && fruit.isBomb) {
                fruits.splice(i, 1);
                continue;
            }

            if (!fruit.sliced) {
                fruit.x += fruit.vx;
                fruit.y += fruit.vy;
                fruit.vy += gravity;
                fruit.spinAngle += fruit.spinSpeed;
            } else {
                fruit.x += fruit.vx;
                fruit.y += fruit.vy;
                fruit.vy += gravity * 1.6; 
                fruit.age += 1;
            }
            if (fruit.y > canvas.height + 120 || fruit.x < -120 || fruit.x > canvas.width + 120) {
                fruits.splice(i, 1);
            }
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += gravity * 0.35;
            p.alpha -= 0.03;
            if (p.alpha <= 0) {
                particles.splice(i, 1);
            }
        }

        for (let i = backgroundSplats.length - 1; i >= 0; i--) {
            const s = backgroundSplats[i];
            s.dripY += s.dripSpeed;
            s.alpha -= 0.0015;
            if (s.alpha <= 0) {
                backgroundSplats.splice(i, 1);
            }
        }

        for (let i = sliceRays.length - 1; i >= 0; i--) {
            const r = sliceRays[i];
            r.alpha -= 0.05;
            if (r.alpha <= 0) {
                sliceRays.splice(i, 1);
            }
        }

        if (particles.length > 250) particles.splice(0, particles.length - 250);
        if (sliceRays.length > 80) sliceRays.splice(0, sliceRays.length - 80);
    }

    function drawDetailedFruitFallback( ctx, type, radius) {
        if (type === 'watermelon') {
            ctx.fillStyle = '#1e7b1e';
            ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ff3333';
            ctx.beginPath(); ctx.arc(0, 0, radius * 0.85, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#000000';
            for (let i = 0; i < 5; i++){
                const sa = (i * Math.PI * 2) / 5; const sr = radius * 0.45;
                ctx.beginPath(); ctx.arc(Math.cos(sa)*sr, Math.sin(sa)*sr, 2, 0, Math.PI * 2); ctx.fill();
            }
        } else if (type === 'orange') {
            ctx.fillStyle = '#cc5500';
            ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffaa00';
            ctx.beginPath(); ctx.arc(0, 0, radius * 0.88, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5 ;
            for (let i = 0; i < 8; i++){
                ctx.beginPath(); ctx.moveTo(0,0);
                const angle = (i * Math.PI * 2) / 8
                ctx.lineTo(Math.cos(angle)*radius*0.88, Math.sin(angle)*radius*0.85); ctx.stroke();
            }
        } else if (type === 'kiwi') {
            ctx.fillStyle = '#553311';
            ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#66ff33';
            ctx.beginPath(); ctx.arc(0, 0, radius * 0.9, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(0, 0, radius * 0.3, 0, Math.PI * 2); ctx.fill();
        } else if (type === 'mango') {
            ctx.fillStyle = '#cc6600';
            ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffcc00';
            ctx.beginPath(); ctx.arc(0, 0, radius * 0.85, 0, Math.PI * 2); ctx.fill();
        } else if (type === 'banana') {
            ctx.fillStyle = '#ffff00';
            ctx.beginPath(); ctx.ellipse(0, 0, radius * 1.3, radius * 0.45, 0, 0, Math.PI *2); ctx.fill();
        } else if (type == 'apple') {
            ctx.fillStyle = '#ff2233'
            ctx.beginPath(); ctx.arc(0, 2, radius, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#000000'
            ctx.beginPath(); ctx.arc(0, -radius, radius * 0.3, 0, Math.PI, true); ctx.fill();
            ctx.strokeStyle = '#5c4033'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(0, -radius * 0.5); ctx.quadraticCurveTo(5, -radius*1.1, 8, -radius*1.2); ctx.stroke();
        } else if ( type === 'pineapple') {
            ctx.fillStyle = '#e1b025'
            ctx.beginPath(); ctx.ellipse(0, 0, radius*0.8, radius*1.1, 0, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#9d6e0f'; ctx.lineWidth = 1.5;
            for (let i = -2; i <= 2; i++) {
                ctx.beginPath();
                ctx.moveTo(-radius * 0.6, i * 8); ctx.lineTo(radius*0.6, i*8-10);
                ctx.moveTo(-radius * 0.6, i * 8 -10); ctx.lineTo(radius*0.6, i*8);
                ctx.stroke();
            }
            ctx.fillStyle = '#1e7b1e'
            ctx.beginPath();
            ctx.moveTo(-10, -radius * 0.9); ctx.lineTo(0, -radius *1.5); ctx.lineTo(10, -radius*0.9);
            ctx.moveTo(-18, -radius * 0.7); ctx.lineTo(-10, -radius *1.3); ctx.lineTo(0, -radius*0.8);
            ctx.moveTo(18, -radius * 0.7); ctx.lineTo(10, -radius *1.3); ctx.lineTo(0, -radius*0.8);
            ctx.fill();
        } else if ( type === 'strawberry') {
            ctx.fillStyle = '#ff2a4b'
            ctx.beginPath(); 
            ctx.moveTo(0, radius*1.1);
            ctx.bezierCurveTo(-radius*1.2, 0, -radius*0.9, -radius, 0, -radius*0.7);
            ctx.bezierCurveTo(-radius*0.9, -radius, radius*1.2, 0, 0, radius*1.1);
            ctx.fill();
            ctx.fillStyle = '#ffeb3b'
            for (let i = -2; i <= 2; i++) {
                for (let j = -2; j <= 2; j++) {
                    if ((i+j)%2 === 0) {
                        ctx.fillRect(i*5, j*5, 1.5, 2.5);
                    }
                }
            }
            ctx.fillStyle = '#4caf50'
            ctx.beginPath();
            ctx.moveTo(0, -radius*0.6);
            ctx.lineTo(-12, -radius*0.9); ctx.lineTo(-4, -radius*0.7);
            ctx.lineTo(0, -radius*1.1); ctx.lineTo(4, -radius*0.7);
            ctx.lineTo(12, -radius*0.9); ctx.closePath(); ctx.fill();
        } else if ( type === 'coconut') {
            ctx.fillStyle = '#6d4c41'
            ctx.beginPath(); ctx.arc(0, 0, radius*0.82, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle= '#ffffff';
            ctx.beginPath(); ctx.arc(0, 0, radius*0.82, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle= '#212121';
            ctx.beginPath(); ctx.arc(0, 0, radius*0.65, 0, Math.PI*2); ctx.fill();
        } else if ( type === 'grape') {
            ctx.fillStyle = '#8a2be2'
            ctx.beginPath(); ctx.arc(-5, -5, radius * 0.5, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(5, -5, radius * 0.5, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(0, 4, radius * 0.5, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(-6, 3, radius * 0.45, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(6, 3, radius * 0.45, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(0, 10, radius * 0.4, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, -12); ctx.stroke();
        } else if ( type === 'bomb') {
            ctx.fillStyle = '#212121'
            ctx.beginPath(); ctx.arc(0, 4, radius * 0.85, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#757575'
            ctx.fillRect(-6, -radius*0.8, 12, 6);
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(0, -radius*0.8); ctx.quadraticCurveTo(8, -radius * 1.2, 12, -radius*1.45);
            ctx.stroke();
            const pulse = Math.sin(Date.now()*0.05)*2.5;
            ctx.fillStyle = '#ff9100';
            ctx.beginPath(); ctx.arc(12, -radius*1.45, 5 + pulse, 0, Math.PI *2); ctx.fill();
            ctx.fillStyle = '#ffea00';
            ctx.beginPath(); ctx.arc(12, -radius*1.45, 2.5, 0, Math.PI*2); ctx.fill();
        }
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!backgroundCache || backgroundCache.width !== canvas.width || backgroundCache.height !== canvas.height) {
            backgroundCache = document.createElement('canvas');
            backgroundCache.width = canvas.width;
            backgroundCache.height = canvas.height;
            const bctx = backgroundCache.getContext('2d');
            bctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
            bctx.fillRect(0, 0, canvas.width, canvas.height);
            bctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
            bctx.lineWidth = 1;
            for (let x = 0; x < canvas.width; x += 40) {
                bctx.beginPath(); bctx.moveTo(x, 0); bctx.lineTo(x, canvas.height); bctx.stroke();
            }
            for (let y = 0; y < canvas.height; y += 40) {
                bctx.beginPath(); bctx.moveTo(0, y); bctx.lineTo(canvas.width, y); bctx.stroke();
            }
        }
        ctx.drawImage(backgroundCache, 0, 0);

        backgroundSplats.forEach(s => {
            ctx.save();
            ctx.globalAlpha = s.alpha;
            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.arc(s.x, s.y + s.dripY, s.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.rect(s.x - s.radius * 0.25, s.y, s.radius * 0.5, s.dripY);
            ctx.fill();
            ctx.restore();
        });
        
        particles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        sliceRays.forEach(r => {
            ctx.save();
            ctx.globalAlpha = r.alpha;
            ctx.strokeStyle = r.color;
            ctx.lineWidth = r.width;
            ctx.beginPath();
            ctx.moveTo(r.x, r.y);
            ctx.lineTo(r.x + Math.cos(r.angle) * r.length, r.y + Math.sin(r.angle) * r.length);
            ctx.stroke();
            ctx.restore();
        });

        fruits.forEach(fruit => {
            const img = preloadedImages[fruit.name];
            
            const crop = imageCrops[fruit.name];
            const aspect = (crop && crop.aspect) ? crop.aspect : 1.0;
            
            let drawW = fruit.radius * 2;
            let drawH = fruit.radius * 2;
            if (aspect > 1) {
                drawH = (fruit.radius * 2) / aspect;
            } else if (aspect < 1) {
                drawW = (fruit.radius * 2) * aspect;
            }

            if (!fruit.sliced) {
                ctx.save();
                ctx.translate(fruit.x, fruit.y);
                ctx.rotate(fruit.spinAngle);

                if (img) {
                    if (crop) {
                        ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, -drawW / 2, -drawH / 2, drawW, drawH);
                    } else {
                        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
                    }
                } else {
                    drawDetailedFruitFallback(ctx, fruit.name, fruit.radius);
                }
                ctx.restore();
            } else {
                if (fruit.isBomb) return;

                const offset = fruit.age * 2.5;
                ctx.save();
                ctx.translate(fruit.x, fruit.y);
                ctx.rotate(fruit.sliceAngle);
                
                ctx.save();
                ctx.translate(-offset, -offset * 0.15);
                ctx.rotate(fruit.age * 0.05);
                ctx.rect(-drawW, -drawH, drawW, drawH * 2);
                ctx.clip();
                if (img) {
                    if (crop) {
                        ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, -drawW / 2, -drawH / 2, drawW, drawH);
                    } else {
                        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
                    }
                } else {
                    drawDetailedFruitFallback(ctx, fruit.name, fruit.radius);
                }
                ctx.restore();

                ctx.save();
                ctx.translate(offset, offset * 0.15);
                ctx.rotate(-fruit.age * 0.05);
                ctx.beginPath();
                ctx.rect(0, -drawH, drawW, drawH * 2);
                ctx.clip();
                if(img){
                    if (crop) {
                        ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, -drawW / 2, -drawH / 2, drawW, drawH);
                    } else {
                        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
                    }
                } else {
                    drawDetailedFruitFallback(ctx, fruit.name, fruit.radius);
                }
                ctx.restore();
                ctx.restore();
            }
            
        });
        Object.keys(players).forEach(pId =>{
            const player = players[pId];
            if (player && player.trail && player.trail.length > 0) {
                drawTrail(player.trail, '#ffffff', player.color);
            }
        });
        Object.keys(players).forEach(pId =>{
            const player = players[pId];
            if (player && player.pointer && player.pointer.x !== -1) {
                drawAnimatedPointer(player.pointer.x, player.pointer.y, player.color);
            }
        });
    }

    function drawTrail(trail, coreColor, glowColor) {
        if (trail.length < 2) return;
        ctx.save();

        for (let i = 1; i < trail.length; i++) {
            const p1 = trail[i - 1];
            const p2 = trail[i];
            const alpha = (i / trail.length);
            ctx.strokeStyle = coreColor;
            ctx.globalAlpha = alpha;
            ctx.lineWidth = 8 * alpha;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            if (Math.random() > 0.65) {
                ctx.fillStyle = glowColor;
                ctx.globalAlpha = alpha * 0.7;
                ctx.beginPath();
                ctx.arc(p2.x + (Math.random() - 0.5) * 8, p2.y + (Math.random() - 0.5) * 8, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
  
        }
        ctx.restore();
    }

    function drawAnimatedPointer(x, y, color) {
        ctx.save();
        const time = Date.now() * 0.005;
        const pulse = Math.sin(time * 2) * 3;
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 10 + pulse, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }

    function showStartFlashSequence() {
        const flash = document.createElement('div');
        flash.id = 'game-start-flash';
        flash.style.position = 'fixed';
        flash.style.top = '0';
        flash.style.left = '0';
        flash.style.width = '100vw';
        flash.style.height = '100vh';
        flash.style.display = 'flex';
        flash.style.flexDirection = 'column';
        flash.style.justifyContent = 'center';
        flash.style.alignItems = 'center';
        flash.style.backgroundColor = 'rgba(0,0,0,0.8)';
        flash.style.zIndex = '9999';
        flash.style.pointerEvents = 'none';
        flash.style.transition = 'opacity 0.5s ease-out';
        flash.innerHTML = `
            <div style="
                font-family: 'Press Start 2P', monospace;
                font-size: 3vw;
                color: #ffeb3b;
                text-align: center;
                animation: flash-anim 0.8s infinite alternate;
                transform: scale(1);
                transition: transform 0.3s ease-out;
            ">
                FIRST TO 100 WINS!
                <div style="font-size: 2vw; color: #ffffff; margin-top: 20px;">GET READY... GO!</div>
            </div>
            <style>
                @keyframes flash-anim {
                    from { opacity: 0.7; transform: scale(0.98); }
                    to { opacity: 1; transform: scale(1.02); }
                }
            </style>
        `;
        document.body.appendChild(flash);
        
        try {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(300, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.3);
        } catch (e) {}

        setTimeout(() => {
            flash.style.opacity = '0';
            setTimeout(() => {
                flash.remove();
            }, 500);
        }, 2500);
    }

    function triggerGameStartSequence() {
        showStartFlashSequence();
        broadcastToGuests({ type: 'start-sequence' });
        setTimeout(() => {
            startSpawning();
        }, 3000); 
    }

    function spawnFruit() {
        if (gameOver) return;

        const keys = Object.keys(FRUIT_PRESETS);
        const template = FRUIT_PRESETS[keys[Math.floor(Math.random() * keys.length)]];

        const launchZone = Math.floor(Math.random() * 3);
        let spawnX = 0;
        let vx = 0;
        
        if (launchZone === 0) {
            spawnX = canvas.width * (0.08 + Math.random() * 0.12);
            vx = 2.0 + Math.random() * 2.8; 
        } else if (launchZone === 1) {
            spawnX = canvas.width * (0.80 + Math.random() * 0.12);
            vx = -2.0 - Math.random() * 2.8; 
        } else {
            spawnX = canvas.width * (0.35 + Math.random() * 0.30);
            vx = (Math.random() - 0.5) * 1.6; 
        }

        const fruit = {
            id: 'f-' + Math.random().toString(36).substring(2, 9),
            x: spawnX,
            y: canvas.height + 40, 
            vx: vx, 
            vy: -11.0 - Math.random() * 4.0, 
            radius: template.radius,
            color: template.color,
            name: template.name,
            isBomb: template.isBomb || false,
            sliced: false,
            sliceAngle: 0,
            age: 0,
            spinAngle: Math.random() * Math.PI,
            spinSpeed: (Math.random() - 0.5) * 0.05 
        };

        fruits.push(fruit);
        broadcastToGuests({ type : 'spawn', fruit });
    }


    function broadcastToGuests(data) {
        Object.keys(conns).forEach(peerId =>{
            const connObj = conns[peerId];
            if (connObj && connObj.open) {
                connObj.send(data);
            }
        });
    }

    function checkSlice(x1, y1, x2, y2, actor) {
        if (gameOver) return;
        if (x1 === -1 || y1 === -1) return;
        fruits.forEach(fruit => {
            if (fruit.sliced) return;
            const segments = 8;
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const sx = x1 + (x2 - x1)*t;
                const sy = y1 + (y2 -y1)*t;

                const dist = Math.hypot(fruit.x - sx, fruit.y - sy);
                if (dist < fruit.radius) {
                    executeSlice(fruit, actor);
                    break;
                }
            }
        });
    }

 function executeSlice(fruit, actorId) {
        fruit.sliced = true;
        let swipeVectorX = 1;
        let swipeVectorY = 0;
        
        const player = players[actorId];
        if (player) {
            swipeVectorX = player.pointer.x - player.pointer.lastX;
            swipeVectorY = player.pointer.y - player.pointer.lastY;
            
           
            if (fruit.isBomb) {
                player.score = Math.max(0, player.score - 10);
            } else {
                player.score++;
            } 
            if (isHost && !gameOver && player.score >= WINNING_SCORE) {
                declareWinner(actorId);
            }   
        }

        fruit.sliceAngle = Math.atan2(swipeVectorY, swipeVectorX);
        if (isNaN(fruit.sliceAngle)) fruit.sliceAngle = Math.random() * Math.PI;

        if (fruit.isBomb) {
            createBombExplosion(fruit.x, fruit.y);
            playExplosionSound();
        } else {
            createSplat(fruit.x, fruit.y, fruit.color);
            playSliceSound();
        }

        renderScoreboard();

        if (isHost) {
            broadcastToGuests({
                type: 'state-sync',
                playersState: serializePlayers(),
                slicedFruitId: fruit.id,
                sliceAngle: fruit.sliceAngle
            });
        } else if (actorId === myId) {
            const hostConn = conns[Object.keys(conns)[0]];
            if (hostConn && hostConn.open) {
                hostConn.send({ type: 'slice-request', fruitId: fruit.id, sliceAngle: fruit.sliceAngle });
            }
        }
    }

    function serializePlayers() {
        let serialized = {};
        Object.keys(players).forEach(pId => {
            serialized[pId] = {
                score: players[pId].score,
                slot: players[pId].slot,
                color: players[pId].color,
                label: players[pId].label
            };
        });
        return serialized;
    }

    function declareWinner(winnerId) {
        gameOver = true;
        if (spawnIntervalId) {
            clearInterval(spawnIntervalId);
            spawnIntervalId = null;
        }
        const winner = players[winnerId];
        const winnerLabel = winnerId === myId ? "YOU" : winner.label;

        broadcastToGuests({
            type: 'game-over',
            winnerId,
            winnerLabel,
            finalScores: serializePlayers()
        });

        showWinnerScreen(winnerLabel, winner.score);
    }

    function showWinnerScreen(winnerLabel, winnerScore) {
        document.getElementById('winner-text').innerText = `${winnerLabel.toUpperCase()} WINS!`;
        document.getElementById('winner-status').innerText = `Reached ${winnerScore} points`;
        document.getElementById('winner-overlay').style.display = 'flex';
    }


    function initHandTracking() {
        const hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 0,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        hands.onResults((results) => {
            if (!trackingReady) {
                trackingReady = true;
                updateStatus(isHost ? "Waiting for peer to join..." : "Connecting to session...");
            }
            processHandMovement(results);
        });

        const activeLocalVideo = document.getElementById(`video-${mySlot}`);
        let lastDetectionTime = 0;
        const detectionIntervalMs = 40; 

        async function detectionLoop(timestamp) {
            try {
                if (activeLocalVideo.readyState >= 2 && timestamp - lastDetectionTime >= detectionIntervalMs) {
                    lastDetectionTime = timestamp;
                    await hands.send({ image: activeLocalVideo });
                }
            } catch (err) {
                console.error('Hand detection frame error:', err);
            }
            requestAnimationFrame(detectionLoop);
        }
        requestAnimationFrame(detectionLoop);
    }


    function processHandMovement(results) {
        if(!myId || !players[myId]) return;
        const localPlayer = players[myId];

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const hand = results.multiHandLandmarks[0];
            const indexTip = hand[8];
            const mappedX = (1 - indexTip.x) * canvas.width;
            const mappedY = indexTip.y * canvas.height;

            localPlayer.pointer.lastX = localPlayer.pointer.x;
            localPlayer.pointer.lastY = localPlayer.pointer.y;

            if (localPlayer.pointer.x === -1 || localPlayer.pointer.y === -1) {
                localPlayer.pointer.x = mappedX;
                localPlayer.pointer.y = mappedY;
            } else {
                const lerpFactor = 0.22; 
                localPlayer.pointer.x += (mappedX - localPlayer.pointer.x) * lerpFactor;
                localPlayer.pointer.y += (mappedY - localPlayer.pointer.y) * lerpFactor;
            }

            localPlayer.trail.push({ x: localPlayer.pointer.x, y: localPlayer.pointer.y });
            if (localPlayer.trail.length > 14) localPlayer.trail.shift();
            
            checkSlice(localPlayer.pointer.lastX, localPlayer.pointer.lastY, localPlayer.pointer.x, localPlayer.pointer.y, myId);
            
            const now = Date.now();
            if (now - lastCursorSendTime > 45) {
                if (isHost) {
                    broadcastToGuests({ type: 'cursor', playerId: myId, x: localPlayer.pointer.x, y: localPlayer.pointer.y });
                } else {
                    const hostConn = conns[Object.keys(conns)[0]];
                    if (hostConn && hostConn.open) {
                        hostConn.send({ type: 'cursor-request', x: localPlayer.pointer.x, y: localPlayer.pointer.y });
                    }
                }
                lastCursorSendTime = now;
            }

            const speed = Math.hypot(localPlayer.pointer.x - localPlayer.pointer.lastX, localPlayer.pointer.y - localPlayer.pointer.lastY );
            if (speed > 45 && Date.now() - lastSwingTime > 300 ) {
                playSwingSound();
                lastSwingTime = Date.now();
            }
        }   else {
            localPlayer.pointer.x = -1;
            localPlayer.pointer.y = -1;
            if (localPlayer.trail.length > 0) localPlayer.trail.shift();
        }
    }

    async function initConnection() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ 
                video: {
                    width: { ideal: 320 },
                    height: { ideal: 240 },
                    frameRate: { ideal: 15, max: 20}
                },
                audio: true
            });
            const urlParams = new URLSearchParams(window.location.search);
            const roomId = urlParams.get('room');

            isHost = !roomId

            if(isHost) {
                const hostRoomId = 'ninja-' + Math.random().toString(36).substring(2,8);
                peer = new Peer(hostRoomId);

                peer.on('open', (id) =>{
                    myId = id;
                    mySlot = 0;

                    players[myId] = {
                        id: myId,
                        slot: 0,
                        score: 0,
                        color: SLOT_COLORS[0],
                        pointer: { x:-1, y:-1, lastX: -1, lastY: -1 },
                        trail: [],
                        label: "Host"
                    };
                    renderScoreboard();
                    updateVideoSlots();

                    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${id}`;
                    document.getElementById('share-url').value = shareUrl;
                    document.getElementById('share-link-section').style.display = 'block';
                    updateStatus("Setup Complete. Share this link with up to 3 friends!");
                    initHandTracking();
                });
                peer.on('connection', (connection) => {
                    if (getPlayerCount() >= 4) {
                        connection.on('open', () => {
                            connection.send({ type: 'rejected', reason: 'Lobby is full! Max 4 players.'});
                            setTimeout(() => connection.close(), 1000);
                        });
                        return;
                    }
                    setupHostDataHandlers(connection);
                });
                peer.on('call', (call) => {
                    if (getPlayerCount() > 4) {
                        call.close();
                        return;
                    }
                    call.answer(localStream);
                    calls[call.peer] = call;
                    handleHostStreamCall(call);
                });
            } else {
                peer = new Peer();
                peer.on('open', (id) => {
                    myId = id;
                    updateStatus("Connecting to your friend's game room...");
                    connectToPeer(roomId)
                });
            }
        } catch (err) {
            console.error(err);
            updateStatus("Camera/Microphone access blocked. Enable permission to continue.");
        }
    }

    function connectToPeer(hostId) {
        const connection = peer.connect(hostId);
        conns[hostId] = connection;
        setupGuestDataHandlers(connection);
        
        const call = peer.call(hostId, localStream);
        calls[hostId] = call;
        handleGuestStreamCall(call);
    }

    function setupHostDataHandlers(connection) {
        const guestId = connection.peer;

        connection.on('open', () => {
            let assignedSlot = -1;
            const usedSlots = Object.values(players).map(p => p.slot);
            for (let s = 0; s < 4; s++) {
                if (!usedSlots.includes(s)) {
                    assignedSlot = s;
                    break;
                }
            }

            players[guestId] = {
                id: guestId,
                slot: assignedSlot,
                score: 0,
                color: SLOT_COLORS[assignedSlot],
                pointer: { x: -1, y: -1, lastX: -1, lastY: -1 },
                trail: [],
                label: `Friend ${assignedSlot}`
            };

            conns[guestId] = connection;

            if (pendingStreams[guestId]) {
                document.getElementById(`video-${assignedSlot}`).srcObject = pendingStreams[guestId];
                delete pendingStreams[guestId];
            }

            connection.send({
                type: 'welcome',
                assignedSlot,
                playersState: serializePlayers(),
                myAssignedId: guestId
            });

            broadcastToGuests({
                type: 'state-sync',
                playersState: serializePlayers()
            });

            renderScoreboard();
            updateVideoSlots();
            document.getElementById('setup-overlay').style.display = 'none';

            if (getPlayerCount() === 2) {
                triggerGameStartSequence();
            }
        });

        connection.on('data', (data) => {
            if (data.type === 'cursor-request' && players[guestId]) {
                const player = players[guestId];
                player.pointer.lastX = player.pointer.x;
                player.pointer.lastY = player.pointer.y;
                
                if (player.pointer.x === -1 || player.pointer.y === -1) {
                    player.pointer.x = data.x;
                    player.pointer.y = data.y;
                } else {
                    const lerpFactor = 0.22;
                    player.pointer.x += (data.x - player.pointer.x) * lerpFactor;
                    player.pointer.y += (data.y - player.pointer.y) * lerpFactor;
                }

                player.trail.push({ x: player.pointer.x, y: player.pointer.y });
                if (player.trail.length > 14) player.trail.shift();

                broadcastToGuests({ type: 'cursor', playerId: guestId, x: player.pointer.x, y: player.pointer.y });
            } else if (data.type === 'slice-request' && players[guestId]) {
                const targetFruit = fruits.find(f => f.id === data.fruitId);
                if (targetFruit && !targetFruit.sliced) {
                    executeSlice(targetFruit, guestId);
                }
            }
        });

        connection.on('close', () => {
            handlePlayerDisconnect(guestId);
        });
    }

       function setupGuestDataHandlers(connection) {
        connection.on('data', (data) => {
            if (data.type === 'rejected') {
                alert(data.reason);
                location.reload();
            } else if (data.type === 'welcome') {
                mySlot = data.assignedSlot;
                
              
                players[myId] = {
                    id: myId,
                    slot: mySlot,
                    score: 0,
                    color: SLOT_COLORS[mySlot],
                    pointer: { x: -1, y: -1, lastX: -1, lastY: -1 },
                    trail: [],
                    label: "You"
                };

                applyPlayersState(data.playersState);
                initHandTracking();
                document.getElementById('setup-overlay').style.display = 'none';
            } else if (data.type === 'state-sync') {
                applyPlayersState(data.playersState);
                if (data.slicedFruitId) {
                    const targetFruit = fruits.find(f => f.id === data.slicedFruitId);
                    if (targetFruit) {
                        targetFruit.sliced = true;
                        targetFruit.sliceAngle = data.sliceAngle;
                        createSplat(targetFruit.x, targetFruit.y, targetFruit.color);
                        playSliceSound();
                    }
                }
            } else if (data.type === 'spawn') {
                fruits.push(data.fruit);
            } else if (data.type === 'cursor') {
                if (players[data.playerId]) {
                    const player = players[data.playerId];
                    player.pointer.lastX = player.pointer.x;
                    player.pointer.lastY = player.pointer.y;
                    
                    if (player.pointer.x === -1 || player.pointer.y === -1) {
                        player.pointer.x = data.x;
                        player.pointer.y = data.y;
                    } else {
                        const lerpFactor = 0.22;
                        player.pointer.x += (data.x - player.pointer.x) * lerpFactor;
                        player.pointer.y += (data.y - player.pointer.y) * lerpFactor;
                    }

                    player.trail.push({ x: player.pointer.x, y: player.pointer.y });
                    if (player.trail.length > 14) player.trail.shift();
                }
            } else if (data.type === 'game-over') {
                gameOver = true;
                showWinnerScreen(data.winnerLabel, data.finalScores[data.winnerId].score);
            } else if (data.type === 'start-sequence') {
                showStartFlashSequence();
            }
        });

        connection.on('close', () => {
            alert("Lobby connection closed.");
            location.reload();
        });
    }

    function handleHostStreamCall(call) {
        call.on('stream', (remoteStream) => {
            const guestId = call.peer;
            const player = players[guestId];
            if (player) {
                document.getElementById(`video-${player.slot}`).srcObject = remoteStream;
            } else {
                pendingStreams[guestId] = remoteStream;
            }
        });
    }

    function handleGuestStreamCall(call) {
        call.on('stream', (remoteStream) => {
            document.getElementById('video-0').srcObject = remoteStream;
        });
    }

    function applyPlayersState(state) {
        Object.keys(state).forEach(pId => {
            if (pId === myId) return;
            
            if (!players[pId]) {
                players[pId] = {
                    id: pId,
                    slot: state[pId].slot,
                    score: state[pId].score,
                    color: state[pId].color,
                    pointer: { x: -1, y: -1, lastX: -1, lastY: -1 },
                    trail: [],
                    label: state[pId].label
                };
            } else {
                players[pId].score = state[pId].score;
                players[pId].slot = state[pId].slot;
                players[pId].color = state[pId].color;
            }
        });

        Object.keys(players).forEach(pId => {
            if (pId !== myId && !state[pId]) {
                delete players[pId];
            }
        });

        renderScoreboard();
        updateVideoSlots();
    }


      function handlePlayerDisconnect(disconnectedId) {
        if (players[disconnectedId]) {
            delete players[disconnectedId];
        }
        if (conns[disconnectedId]) {
            conns[disconnectedId].close();
            delete conns[disconnectedId];
        }
        if (calls[disconnectedId]) {
            calls[disconnectedId].close();
            delete calls[disconnectedId];
        }

        renderScoreboard();
        updateVideoSlots();

        broadcastToGuests({
            type: 'state-sync',
            playersState: serializePlayers()
        });

        if (getPlayerCount() < 2 && spawnIntervalId) {
            clearInterval(spawnIntervalId);
            spawnIntervalId = null;
        }
    }

    function startSpawning() {
        if (spawnIntervalId) clearInterval(spawnIntervalId);
        spawnIntervalId = setInterval(() => {
            if (isHost && !gameOver && Object.keys(conns).length > 0) {
                const activeCount = getPlayerCount();
                const spawnIntensity = activeCount <= 2 ? 2 : Math.min(4, activeCount);
                
                for (let i = 0; i < spawnIntensity; i++) {
                    setTimeout(() => {
                        if (isHost) spawnFruit();
                    }, i * 350);
                }
            }
        }, 1500); 
    }




    function updateStatus(text) {
        document.getElementById('setup-status').innerText = text;
    }

    function copyShareUrl() {
        const urlBox = document.getElementById('share-url');
        if (!urlBox) return;
        urlBox.select();
        urlBox.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(urlBox.value);
        const btn = document.querySelector("#share-link-section button");
        if (btn) {
            btn.innerText = "Copied!";
            setTimeout(() => { btn.innerText = "Copy Link"; }, 2000);
        }
    }

    function gameLoop() {
        updatePhysics();
        draw();
        requestAnimationFrame(gameLoop);
    }

    initConnection();
    gameLoop();