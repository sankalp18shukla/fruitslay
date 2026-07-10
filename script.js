const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const localVideo = document.getElementById('localVideo');
    const peerVideo = document.getElementById('peerVideo');

    let myScore = 0;
    let peerScore = 0;

    let fruits = [];
    let particles = [];
    let backgroundSplats = [];
    let sliceRays = [];
    const gravity = 0.16;
    let spawnIntervalId= null;

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    let myPointer = { x: -1, y: -1, lastX: -1, lastY: -1 };
    let peerPointer = { x: -1, y: -1, lastX: -1, lastY: -1 };
    let myTrail = [];
    let peerTrail = [];
    let lastSwingTime = 0;

    let isHost = false;
    let peer;
    let conn;
    let localStream;
    let trackingReady = false;

    const FRUIT_PRESETS = {
        watermelon: { name: 'watermelon', radius: 40, color: '#ff3333', src: 'watermelon.png' },
        orange: { name: 'orange', radius: 24, color: '#ff9900', src: 'orange.png' },
        banana: { name: 'banana', radius: 23, color: '#ffff33', src: 'banana.png' },
        kiwi: { name: 'kiwi', radius: 18, color: '#66ff66', src: 'kiwi.png' },
        mango: { name: 'mango', radius: 25, color: '#ffcc00', src: 'mango.png' },
    }

    const preloadedImages = {};
    Object.keys(FRUIT_PRESETS).forEach(key => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = FRUIT_PRESETS[key].src;
        img.onload = () => {
            preloadedImages[key] = img;
        };
    });

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

    function createSplat(x, y, color) {
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const speed = 3 + Math.random() * 5;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: Math.random() * 3 + 2,
                color,
                alpha: 1.0
            });
        }

        for (let i = 0; i < 4; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const speed = 2 + Math.random() * 3;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: Math.random() * 2 + 1,
                color,
                alpha: 1.0
            });
        }

        const rayCount = 6 + Math.floor(Math.random()*3);
        for (let i = 0; i < rayCount; i++) {
            sliceRays.push({
                x,y,
                angle: ( i * Math.PI * 2 ) / rayCount + (Math.random() - 0.5) * 0.25,
                length: 120 + Math.random() * 120,
                width: 3 + Math.random() * 4,
                color,
                alpha: 1.0

            });
        }

    }

    function updateParticles() {
        for (let i = fruits.length - 1; i >= 0; i--) {
            const fruit = fruits[i];
            if (!fruit.sliced) {
                fruit.x += fruit.vx;
                fruit.y += fruit.vy;
                fruit.vy += gravity;
                fruit.spinAngle += fruit.spinSpeed;
            } else {
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
            ctx.beginPath(); ctx.ellipse(0, 0, radius * 1.3, 0, 0, Math.PI * 2); ctx.fill();
        }

    }

    function draw() {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#1e1e1e';
        ctx.lineWidth = 1;
        for (let x =0; x < canvas.width; x += 40) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
        }
        for (let y =0; y < canvas.height; y += 40) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
        }
        backgroundSplats.forEach(s => {
            ctx.save();
            ctx.globalAlpha = s.alpha;
            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.arc(s.x, s.y + s.dripY, s.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.rect(s.x - s.radius * 0.25, s.y, s.radius * 0.5, dripY);
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

        sliceRays.forrEach(r =>{
            ctx.save();
            ctx.globalAlpha = r.alpha;
            ctx.shadowBlur = 25;
            ctx.shadowColor = r.color;
            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = r.widt;
            ctx.beginPath();
            ctx.moveTo(r.x, r.y)
            ctx.lineTo(r.x + Math.cos(r.angle) * r.length, r.y + Math.sin(r.angle) * r.length);
            ctx.stroke();
            ctx.restore();
        });

        fruits.forEach(fruit => {
            const img = preloadedImages[fruit.name];
            if (!fruit.sliced) {
                ctx.save();
                ctx.translate(fruit.x, fruit.y);
                ctx.rotate(fruit.spinAngle);
                ctx.shadowColor = 'rgba(0,0,0, 0.9)';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetY = 8;

                if (img) {
                     ctx.drawImage(img, -fruit.radius )
                } else {
                    drawDetailedFruitFallback(ctx, fruit.name, fruit.radius);
                }
                ctx.restore();
            } else {
                const offset = fruit.age * 2.5;
                ctx.save();
                ctx.translate(fruit.x, fruit.y);
                ctx.rotate(fruit.sliceAngle);
                ctx.save();
                ctx.translate(-offset, -offset * 0.15);
                ctx.rotate(fruit.age * 0.05);
                ctx.rect(-fruit.radius * 2, -fruit.radius * 2, fruit.radius * 2, fruit.radius * 4);
                ctx.clip();
                if (img) {
                    ctx.drawImage(img, -fruit.radius, -fruit.radius, fruit.radius * 2, fruit.radius * 2);
                } else {
                    drawDetailedFruitFallback(ctx, fruit.name, fruit.radius);
                }
                ctx.restore();
                ctx.save();
                ctx.translate(offset, offset * 0.15);
                ctx.rotate(-fruit.age * 0.05);
                ctx.beginPath();
                ctx.rect(0, -fruit.radius * 2, fruit.radius * 2, fruit.radius * 4);
                ctx.clip();
                if(img){
                    ctx.drawImage(img, -fruit.radius, -fruit.radius, fruit.radius * 2, fruit.radius * 2);
                } else {
                    drawDetailedFruitFallback(ctx, fruit.name, fruit.radius);
                }
                ctx.restore();
                ctx.restore();
            }
            
        });

        drawTrail(myTrail, '#ffffff', '#ffaa00');
        drawTrail(peerTrail, '#ffffff', '#00ffff');

        if (myPointer.x !== -1){
            drawAnimatedPointer(myPointer.x, myPointer.y, '#ffaa00');
        }

        if (peerPointer.x !== -1){
            drawAnimatedPointer(peerPointer.x, peerPointer.y, #00ffff);
        }
    }

    function drawTrail(trail, coreColor, glowColor) {
        if (trail.length < 2) return;
        ctx.save();
        ctx.shadowBlur = 24;
        ctx.shadowColor = glowColor;

        for (let i = 1, i < trail.length; i++) {
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
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 15;
        ctx.shadowColor = color;
        ctx.beginPath();
        ctx.arc(x, y, 11 + Math.sin(time * 2) * 3, 0, Math.PI * 2);
        ctx.stroke();
    }

