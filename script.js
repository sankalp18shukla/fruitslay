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

    


