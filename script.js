const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

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
        apple: { name: 'apple', radius: 24, color: '#ff2233', src: 'apple.png'},
        pineapple: { name: 'pineapple', radius: 36, color: '#e1b025', src: 'pineapple.png'},
        strawberry: { name: 'strawberry', radius: 17, color: '#ff2a4b', src: 'strawberry.png'},
        coconut: { name: 'coconut', radius: 28, color: '#8d5524', src: 'coconut.png'},
        grape: { name: 'grape', radius: 21, color: '#8a2be2', src: 'grape.png' },
        bomb: { name: 'bomb', radius: 26, color: '#ff5722', src: 'bomb.png', isBomb: true }
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

    function updatePhysics() {
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
    //fallback fruits and bomb
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
            //burning spark
            const pulse = Math.sin(Date.now()*0.05)*2.5;
            ctx.fillStyle = '#ff9100';
            ctx.beginPath(); ctx.arc(12, -radius*1.45, 5 + pulse, 0, Math.PI *2); ctx.fill();
            ctx.fillStyle = '#ffea00';
            ctx.beginPath(); ctx.arc(12, -radius*1.45, 2.5, 0, Math.PI*2); ctx.fill();
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
            ctx.shadowBlur = 25;
            ctx.shadowColor = r.color;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = r.width;
            ctx.beginPath();
            ctx.moveTo(r.x, r.y);
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
                    ctx.drawImage(img, -fruit.radius, -fruit.radius, fruit.radius * 2, fruit.radius * 2);
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
            drawAnimatedPointer(peerPointer.x, peerPointer.y, '#00ffff');
        }
    }

    function drawTrail(trail, coreColor, glowColor) {
        if (trail.length < 2) return;
        ctx.save();
        ctx.shadowBlur = 24;
        ctx.shadowColor = glowColor;

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
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 15;
        ctx.shadowColor = color;
        ctx.beginPath();
        ctx.arc(x, y, 11 + Math.sin(time * 2) * 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            const angle = time + (i * Math.PI) / 2;
            const targetX = x + Math.cos(angle) * 14;
            const targetY = y + Math.sin(angle) * 14;
            ctx.moveTo(x, y);
            ctx.quadraticCurveTo(x + Math.cos(angle + 0.3) * 8, y + Math.sin(angle + 0.3) * 8, targetX, targetY);
        }
        ctx.stroke();
        ctx.fillStyle = '#ffffff'
        ctx.shadowBlur = 5;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI)/ 4 + time * 1.5;
            const r = i%2 === 0 ? 15 : 6;
            ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function spawnFruit() {
        const fruitTemplates = [
            { color: '#ff3333', name : 'watermelon', radius : 40},
            { color: '#ff9900', name : 'orange', radius : 24},
            { color: '#66ff66', name : 'kiwi', radius : 18},
            { color: '#ffcc00', name : 'mango', radius : 25},
            { color: '#ffff33', name : 'banana', radius : 23},
            { color: '#ff2233', name: 'apple', radius : 24},
            { color: '#e1b025', name: 'pineapple', radius : 36 },
            { color: '#ff2a4b', name: 'strawberry', radius : 17},
            { color: '#ffffff', name: 'coconut', radius : 28},
            { color: '#8a2be2', name: 'grape', radius : 21},
            { color: '#ff5722', name: 'bomb', radius: 26, isBomb: true }
        ]

        const template = fruitTemplates[Math.floor(Math.random()* fruitTemplates.length)];
        const fruit = {
            id: 'f-' + Math.random().toString(36).substring(2, 9),
            x: canvas.width * (0.15 + Math.random() * 0.7),
            y: canvas.height + 40, 
            vx: (Math.random() - 0.5) * 4.8, 
            vy: -11 -Math.random() * 4.8,
            radius: template.radius,
            color: template.color,
            name: template.name,
            isBomb: template.isBomb || false,
            sliced: false,
            sliceAngle: 0,
            age: 0,
            spinAngle: Math.random() * Math.PI,
            spinSpeed: (Math.random() - 0.5) * 0.1
        };

        fruits.push(fruit);
        if (conn && conn.open) {
            conn.send({ type: 'spawn', fruit});
        }
    }

    function checkSlice(x1, y1, x2, y2, actor) {
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

    function setupVideoAssignments() {
        const leftVideo = document.getElementById('leftVideo');
        const rightVideo = document.getElementById('rightVideo');
        const leftLabel = document.getElementById('left-label');
        const rightLabel = document.getElementById('right-label');
        const leftBox = document.getElementById('left-video-box');
        const rightBox = document.getElementById('right-video-box');

        if (isHost) {
            rightVideo.srcObject = localStream;
            rightVideo.muted = true;
            rightLabel.innerText = "You (Host)";
            rightBox.style.borderColor = "var(--orange)";

            leftLabel.innerText = "Friend";
            leftBox.style.borderColor = "var(--blue)";
        } else {
            leftVideo.srcObject = localStream;
            leftVideo.muted = true;
            leftLabel.innerText = "You (Friend)";
            leftBox.style.borderColor = "var(--orange)";
            rightLabel.innerText = "Host";
            rightBox.style.borderColor = "var(--blue)";
        }
    }

    function executeSlice(fruit, actor) {
        fruit.sliced = true;
        let swipeVectorX = 1;
        let swipeVectorY = 0;
        if (actor === 'me') {
            swipeVectorX = myPointer.x - myPointer.lastX;
            swipeVectorY = myPointer.y -myPointer.lastY;
        } else {
            swipeVectorX = peerPointer.x - peerPointer.lastX;
            swipeVectorY = peerPointer.y - peerPointer.lastY; 
        }
        fruit.sliceAngle = Math.atan2(swipeVectorY, swipeVectorX);
        if (isNaN(fruit.sliceAngle)) fruit.sliceAngle = Math.random() * Math.PI;

        createSplat(fruit.x, fruit.y, fruit.color);
        playSliceSound();
        if (actor === 'me') {
            if (fruit.isBomb) {
                myScore = Math.max(0, myScore - 10);
            } else {
                myScore++;
            }
            document.getElementById('my-score-val').innerText = myScore;
            if (conn && conn.open) {
                conn.send({type : 'slice', fruitId : fruit.id });
            }
        } else {
            if (fruit.isBomb) {
                peerScore = Math.max(0, peerScore - 10);
            } else {
                peerScore++;
            }
            document.getElementById('peer-score-val').innerText = peerScore;
        }
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

        const activeLocalVideo = isHost ? document.getElementById('rightVideo') : document.getElementById('leftVideo');
        const camera = new Camera(activeLocalVideo, {
            onFrame: async () =>  {
                await hands.send({ image: activeLocalVideo });
            },
            width: 320,
            height: 240,
        });
        camera.start();
    }

    function processHandMovement(results) {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const hand = results.multiHandLandmarks[0];
            const indexTip = hand[8];
            const mappedX = (1 - indexTip.x) * canvas.width;
            const mappedY = indexTip.y * canvas.height;

            myPointer.lastX = myPointer.x;
            myPointer.lastY = myPointer.y;
            myPointer.x = mappedX;
            myPointer.y = mappedY;

            myTrail.push({ x: mappedX, y: mappedY });
            if (myTrail.length > 14) myTrail.shift();
            
            checkSlice(myPointer.lastX, myPointer.lastY, mappedX, mappedY, 'me');
            if (conn && conn.open) {
                conn.send({ type: 'cursor', x: mappedX, y: mappedY });
            }

            const speed = Math.hypot(mappedX - myPointer.lastX, mappedY - myPointer.lastY );
            if (speed > 45 && Date.now() - lastSwingTime > 300 ) {
                playSwingSound();
                lastSwingTime = Date.now();
            }
        }   else {
            myPointer.x = -1;
            myPointer.y = -1;
            if (myTrail.length > 0) myTrail.shift();
        }
    }

    async function initConnection() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio : true });
            const urlParams = new URLSearchParams(window.location.search);
            const roomId = urlParams.get('room');
            if (roomId) {
                isHost = false;
            } else {
                isHost = true;
            }

            setupVideoAssignments();
            initHandTracking();

            if (isHost) {
                const hostRoomId = 'ninja-' + Math.random().toString(36).substring(2, 8);
                peer = new Peer(hostRoomId);
                peer.on('open', (id) => {
                    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${id}`;
                    document.getElementById('share-url').value = shareUrl;
                    document.getElementById('share-link-section').style.display = 'block';
                    updateStatus("Setup Complete. Share this link to start playing!");
                });

                peer.on('connection', (connection) => {
                    conn = connection;
                    setupDataHandlers();
                });

                peer.on('call', (call) => {
                    call.answer(localStream);
                    handleStreamCall(call);
                });
            } else {
                peer = new Peer();
                peer.on('open', () => {
                    connectToPeer(roomId);
                });
                peer.on('error', (err) => {
                    console.error(err);
                    updateStatus('Connection error: ' + (err.message || err));
                });
                updateStatus('Connecting to session...');
            }
        } catch(err) {
            console.error(err);
            updateStatus("Camera/Microphone access blocked. Enable permission to continue.");
        }
    }

    function connectToPeer(hostId) {
        conn = peer.connect(hostId);
        setupDataHandlers();
        const call = peer.call(hostId, localStream);
        handleStreamCall(call);
    }

    function handleStreamCall(call) {
        call.on('stream', (remoteStream) =>{
            if(isHost) {
                document.getElementById('leftVideo').srcObject = remoteStream;
            } else {
                document.getElementById('rightVideo').srcObject = remoteStream;
            }
            document.getElementById('setup-overlay').style.display = 'none';
        });
    }
    function setupDataHandlers() {
        conn.on('open', () => {
            document.getElementById('setup-overlay').style.display = 'none';
            if (isHost) {
                startSpawning();
            }
        });

        conn.on('data', (data) => {
            if (data.type === 'cursor') {
                peerPointer.lastX = peerPointer.x;
                peerPointer.lastY = peerPointer.y;
                peerPointer.x = data.x;
                peerPointer.y = data.y;
                peerTrail.push({ x: data.x, y: data.y});
                if (peerTrail.length > 14) peerTrail.shift();
            } else if (data.type === 'spawn') {
                fruits.push(data.fruit);
            } else if (data.type === 'slice') {
                const targetFruit = fruits.find(f => f.id === data.fruitId);
                if (targetFruit && !targetFruit.sliced) {
                    executeSlice(targetFruit, 'peer');
                }
            }
        });

        conn.on('close', () => { 
            alert("Connection closed. The friend disconnected.");
            location.reload();
        });
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

    function startSpawning() {
        if (spawnIntervalId) return;
        spawnFruit();
        spawnIntervalId = setInterval(spawnFruit, 1400);
    }

    function gameLoop() {
        updatePhysics();
        draw();
        requestAnimationFrame(gameLoop);
    }

    initConnection();
    gameLoop();






