(() => {
    'use strict';
    // Suspend game timers without losing the remaining animation/reward delays.
    const pendingTimers = new Map();
    const pauseReasons = new Set();
    let timerId = 0, pausedAt = 0;
    const isPaused = () => pauseReasons.size > 0;
    function armTimer(id, timer) {
        timer.started = Date.now();
        timer.native = window.setTimeout(() => {
            pendingTimers.delete(id);
            const index = faceTimers.indexOf(id);
            if (index !== -1) faceTimers.splice(index, 1);
            timer.callback();
        }, timer.remaining);
    }
    function setTimeout(callback, delay = 0) {
        const id = ++timerId, timer = {callback, remaining: delay, started: 0, native: null};
        pendingTimers.set(id, timer);
        if (!isPaused()) armTimer(id, timer);
        return id;
    }
    function clearTimeout(id) {
        const timer = pendingTimers.get(id);
        if (timer) window.clearTimeout(timer.native);
        pendingTimers.delete(id);
    }
    function pauseGame(reason) {
        if (pauseReasons.has(reason)) return;
        const alreadyPaused = isPaused();
        pauseReasons.add(reason);
        if (alreadyPaused) return;
        pausedAt = Date.now();
        clockPause();
        stopSound();
        stopEffects();
        for (const timer of pendingTimers.values()) {
            window.clearTimeout(timer.native);
            timer.remaining = Math.max(0, timer.remaining - (pausedAt - timer.started));
        }
        scene.classList.add('game-paused');
        saveWhackProgress();
    }
    function resumeGame(reason) {
        if (!pauseReasons.delete(reason) || isPaused()) return;
        if (cooldownUntil) cooldownUntil += Date.now() - pausedAt;
        for (const [id, timer] of pendingTimers) armTimer(id, timer);
        scene.classList.remove('game-paused');
        if (!stopped) clockStart();
    }
    const $ = id => document.getElementById(id);
    const scene = $('scene'), grid = $('moleGrid'), status = $('status'), hammer = $('hammer'), hammerFrame = $('hammerFrame');
    const folders = 'images/';
    // Replace any audio/effects/*.mp3 later without changing game code.
    const effectVolumes = {
        'correct-word': 0.55, 'wrong-word': 0.3,
        'correct-letter': 0.35, 'wrong-letter': 0.3,
        'freeze-start': 0.65,
        'w-reveal': 0.55, 'l-reveal': 0.55,
        'hammer-power': 0.45, 'super': 0.55,
        'lightning': 0.65, 'bonus-50': 0.5, 'game-complete': 0.65
    };
    // Map game events to the shared effect recordings.
    const effectFiles = {
        'correct-letter': 'correct.mp3',
        'correct-word': 'correct.mp3',
        'wrong-letter': 'wrong.mp3',
        'wrong-word': 'wrong.mp3',
        'l-reveal': 'super.mp3',
        'w-reveal': 'super.mp3'
    };
    const activeEffects = new Set();
    function playEffect(name) {
        const sound = new Audio('audio/effects/' + (effectFiles[name] ?? name + '.mp3'));
        sound.volume = effectVolumes[name] ?? 0.5;
        activeEffects.add(sound);
        const cleanup = () => activeEffects.delete(sound);
        sound.addEventListener('ended', cleanup, { once: true });
        sound.addEventListener('error', cleanup, { once: true });
        sound.play().catch(cleanup);
    }
    function stopEffects() {
        for (const sound of activeEffects) { sound.pause(); sound.currentTime = 0; }
        activeEffects.clear();
    }
    // Game rules overlay. The info button stays accessible during play.
    const infoButton = $('infoButton'), infoOverlay = $('infoOverlay');
    const infoDone = $('infoDone');
    let previousInfoFocus = null;
    const infoAudio = new Audio('audio/info/whackamole.mp3');
    infoAudio.preload = 'auto';
    infoAudio.volume = 0.85;
    function showGameInfo() {
        previousInfoFocus = document.activeElement;
        pauseGame('info');
        infoOverlay.hidden = false;
        infoAudio.pause();
        infoAudio.currentTime = 0;
        infoAudio.play().catch(() => {});
        infoDone.focus();
    }
    function hideGameInfo() {
        infoOverlay.hidden = true;
        resumeGame('info');
        infoAudio.pause();
        infoAudio.currentTime = 0;
        if (previousInfoFocus && typeof previousInfoFocus.focus === 'function') previousInfoFocus.focus();
    }
    infoButton.addEventListener('click', showGameInfo);
    infoDone.addEventListener('click', hideGameInfo);
    infoOverlay.addEventListener('click', event => { if (event.target === infoOverlay) hideGameInfo(); });
    document.addEventListener('keydown', event => {
        if (infoOverlay.hidden) return;
        if (event.key === 'Escape') { event.preventDefault(); hideGameInfo(); }
        if (event.key === 'Tab') {
            const focusable = [infoDone];
            const first = focusable[0], last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    });

    const superCelebration = $('superCelebration');
    const freezeButton = $('freezeButton'), freezeCount = $('freezeCount'), bonusCount = $('bonusCount');
    let freezeCharges = 0, bonusPoints = 0, correctWordStreak = 0, freezeWordStreak = 0, freezeTimer = null, frozen = false;
    function updateRewards() {
        freezeCount.textContent = freezeCharges;
        bonusCount.textContent = bonusPoints;
        updatePlayerStats();
        freezeButton.disabled = freezeCharges < 1 || frozen || stopped || answered;
        freezeButton.classList.toggle('is-frozen', frozen);
        saveWhackProgress();
    }
    function endFreeze() {
        if (!frozen) return;
        clearTimeout(freezeTimer);
        freezeTimer = null;
        frozen = false;
        scene.classList.remove('game-frozen');
        if (!stopped && !answered) {
            // Resume mole movement after their frozen five-second interval.
            for (const slot of grid.children) {
                slot.classList.remove('down', 'rising');
                if (!popTimers.has(slot)) schedulePop(slot);
            }
        }
        updateRewards();
    }
    function startFreeze() {
        if (isPaused() || stopped || answered || frozen || freezeCharges < 1) return;
        freezeCharges--;
        frozen = true;
        scene.classList.add('game-frozen');
        playEffect('freeze-start');
        // Suspend scheduled mole dives while CSS pauses every moving letter/mole.
        for (const timer of popTimers.values()) clearTimeout(timer);
        popTimers.clear();
        updateRewards();
        freezeTimer = setTimeout(endFreeze, 5000);
    }
    freezeButton.addEventListener('click', startFreeze);

    const letterLayer = $('floatingLetters'), powerEffect = $('powerEffect'), clockDisplay = $('gameClock');
    const hammerCountdown = $('hammerCountdown'), hammerCountdownNumber = $('hammerCountdownNumber');
    let cooldownUntil = 0, cooldownTimer = null, clockInterval = null, elapsedMs = 0, clockStarted = 0;
    function updateHammerCountdown() {
        const remaining = Math.max(0, cooldownUntil - (isPaused() ? pausedAt : Date.now()));
        const visible = remaining > 0 && !stopped;
        hammerCountdown.classList.toggle('visible', visible);
        hammerCountdown.setAttribute('aria-hidden', String(!visible));
        if (visible) hammerCountdownNumber.textContent = String(Math.ceil(remaining / 1000));
    }
    function clockTick() {
        const ms = elapsedMs + (clockStarted ? Date.now() - clockStarted: 0);
        const seconds = Math.floor(ms / 1000);
        clockDisplay.textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds%60).padStart(2, '0');
        updateHammerCountdown();
    }
    function clockPause() {
        if (clockStarted) {
            elapsedMs += Date.now() - clockStarted;
            clockStarted = 0;
        }
        clockTick();
    }
    function clockStart() {
        if (!clockStarted)clockStarted = Date.now();
        clockTick();
    }
    function cooldownActive() {
        return Date.now() < cooldownUntil;
    }
    function setCooldown(seconds) {
        cooldownUntil = Date.now() + seconds * 1000;
        hammer.classList.add('cooldown');
        updateHammerCountdown();
        clearTimeout(cooldownTimer);
        cooldownTimer = setTimeout(() => {
            hammer.classList.remove('cooldown');
            cooldownUntil = 0;
            updateHammerCountdown();
        }, seconds * 1000);
    }
    function playPhoneme(letter) {
        const audio = new Audio('audio/phonemes/' + encodeURIComponent(letter) + '.mp3');
        stopSound();
        activeAudio = audio;
        audio.play().catch (() => {
            console.info('Add audio/phonemes/' + letter + '.mp3 for the correct first-letter sound.');
        });
    }
    // Rare hint bonuses: 5% for W or 5% for L on each round, never both together.
    // Bonus images sit above letters, moles, effects and the game HUD.
    let hintGlowTimer = null;
    function removeHintGlow() {
        clearTimeout(hintGlowTimer);
        scene.classList.remove('hint-word-active', 'hint-letter-active');
        grid.querySelectorAll('.hint-correct-word').forEach(el => el.classList.remove('hint-correct-word'));
        letterLayer.querySelectorAll('.hint-correct-letter').forEach(el => el.classList.remove('hint-correct-letter'));
    }
    function refreshWordHint() {
        if (!scene.classList.contains('hint-word-active') || !questions[round]) return;
        for (const slot of grid.children) {
            slot.classList.toggle('hint-correct-word', slot.dataset.word === questions[round].answer);
        }
    }
    function triggerHint(kind) {
        if (isPaused() || stopped || answered) return;
        if (kind === 'W') {
            playEffect('w-reveal');
            scene.classList.add('hint-word-active');
            refreshWordHint();
        } else {
            playEffect('l-reveal');
            scene.classList.add('hint-letter-active');
            letterLayer.querySelector('.float-letter.correct-target')?.classList.add('hint-correct-letter');
        }
        clearTimeout(hintGlowTimer);
        // Highlight lasts until the next word or for up to five seconds.
        hintGlowTimer = setTimeout(removeHintGlow, 5000);
    }
    function spawnHintBonus(kind) {
        const bonus = document.createElement('button');
        bonus.type = 'button';
        bonus.className = 'floating-hint-bonus';
        bonus.classList.add(Math.random() < 0.5 ? 'from-right' : 'from-left');

        // Random vertical position
        bonus.style.setProperty('--bonus-y', `${5 + Math.random() * 72}%`);

        // Random starting position
        bonus.style.setProperty('--bonus-delay', '0s');

        // Original L/W bonus speed is set to 5 seconds in style.css.
        
        bonus.title = kind === 'W' ? 'Reveal the correct word' : 'Reveal the correct letter';
        bonus.setAttribute('aria-label', bonus.title);
        const picture = document.createElement('img');
        picture.src = `images/buttons/${kind}.png`;
        picture.alt = '';
        bonus.appendChild(picture);
        bonus.addEventListener('pointerdown', event => event.stopPropagation());
        bonus.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            if (isPaused() || stopped || answered) return;
            bonus.remove();
            triggerHint(kind);
        });
        // Each bonus crosses the screen once, then disappears.
        bonus.addEventListener('animationend', () => bonus.remove(), { once: true });
        letterLayer.appendChild(bonus);
    }
    function generateLetters() {
        letterLayer.replaceChildren();
        if (!questions[round])return;
        const answer = questions[round].answer.toLowerCase();
        // Floating choices use single letters only; the first letter is correct.
        const initial = answer.charAt(0);
        const choices = 'abcdefghijklmnopqrstuvwxyz'.split('').filter(c => c !== initial);
        const letters = shuffle([initial, ...shuffle(choices).slice(0, 4)]);
        letters.forEach((letter, i) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'float-letter';
            // Keep the correct answer visually above all other floating letters.
            if (letter === initial) b.classList.add('correct-target');
            b.style.setProperty('--letters', letter.length);
            b.textContent = letter;
            b.setAttribute('aria-label', 'Letter ' + letter);
            // Random direction: left or right
const direction = Math.random() < 0.5 ? 'left' : 'right';

// Random speed: 8–22 seconds
const duration = 8 + Math.random() * 14;

// Random starting delay: 0–5 seconds
const delay = -(Math.random() * duration);

// Random vertical position
const y = 5 + Math.random() * 55;

// Set direction, speed, delay, and height
b.classList.toggle('from-right', direction === 'right');
b.style.setProperty('--letter-duration', `${duration}s`);
b.style.setProperty('--letter-delay', `${delay}s`);
b.style.setProperty('--letter-y', `${y}%`);
            b.addEventListener('pointerdown', e => e.stopPropagation());
            b.addEventListener('click', e => {
                e.stopPropagation();
                if (isPaused() || stopped || answered || locked || cooldownActive() || b.disabled)return;
                if (letter !== initial) {
                    correctWordStreak = 0;
                    freezeWordStreak = 0;
                    b.classList.add('wrong-letter');
                    playEffect('wrong-letter');
                    setCooldown(2);
                    saveWhackProgress();
                    setTimeout(() => b.classList.remove('wrong-letter'), 500);
                    return;
                }
                playPhoneme(letter);
                playEffect('correct-letter');
                // Reward each correctly selected floating letter once.
                bonusPoints += 5;
                updateRewards();
                const a = b.getBoundingClientRect(), r = scene.getBoundingClientRect();
                powerEffect.style.left = (a.left - r.left + a.width / 2) + 'px';
                powerEffect.style.top = (a.top - r.top + a.height / 2) + 'px';
                powerEffect.textContent = '✨✦✨';
                powerEffect.classList.remove('burst');
                void powerEffect.offsetWidth;
                powerEffect.classList.add('burst');
                // Remove the entire floating letter/sign immediately after a correct tap.
                // The sparkle effect is separate from the disappearing floating letter.
                b.disabled = true;
                b.remove();
            });
            letterLayer.appendChild(b);
        });
        // Combined 5% chance per new word: 2.5% W or 2.5% L.
        // Exactly one hint at most can appear during this round.
        const hintRoll = Math.random();
        if (hintRoll < 0.025) spawnHintBonus('W');
        else if (hintRoll < 0.05) spawnHintBonus('L');
    }
    function hideSuper() {
        superCelebration.classList.remove('playing');
    }
    function showSuper(lightningReward = 0) {
        hideSuper();
        superCelebration.src = lightningReward === 200 ? 'images/popouts/lightning200.png' : lightningReward === 50 ? 'images/popouts/lightning50.png' : 'images/popouts/super.png';
        superCelebration.alt = lightningReward ? `Lightning! Plus ${lightningReward} bonus points!` : 'Super!';
        void superCelebration.offsetWidth;
        superCelebration.classList.add('playing');
    }
    const faces = ['toung.png', 'normalface.png'];
    const hitFaces = ['hit1.png', 'hit2.png', 'hit3.png', 'hit4.png', 'hit5.png'];
    const backgrounds = ['background1.png', 'background2.png', 'background3.png', 'background4.png', 'background5.png', 'background6.png', 'background7.png', 'background8.png', 'background9.png', 'background10.png', 'background11.png'];
    let backgroundSequence = backgrounds.slice();
    const getBackgroundNumber = name => Number((name.match(/background(\d+)\.png$/) || [, '1'])[1]);
    const SLOT_SIZE = {
        w: 7.92, h: 11.088
    };
    // 10% smaller than previous version
    // All seven slots use the same matching dirt artwork.
    // Standalone recording manifest: all word MP3 files live in this game's audio/words folder.
    const audioWordFiles = Object.fromEntries((window.WHACK_WORDS || []).map(word => [word, word + '.mp3']));
    const availableWords = Object.keys(audioWordFiles);
    const wordSet = new Set(availableWords);
    let lastPointer = null, gamePositions = [], questions = [], round = 0, score = 0, answered = false, swapping = false, locked = false, stopped = false, popTimers = new Map(), faceTimers = [], advanceTimer = null, activeAudio = null, speechToken = 0, hammerTimer = null;
    const random = a => a[Math.floor(Math.random() * a.length)];
    function shuffle(input) {
        let a = [...input];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // Separate game progress and statistics for the selected Word Families player.
    const playerId = new URLSearchParams(location.search).get('player');
    if (!playerId) { location.replace('../index.html'); return; }
    const progressKey = 'wordfamilies-whack-round-v1:' + playerId;
    const statsKey = 'wordfamilies-whack-stats-v1:' + playerId;
    let playerStats = {correctWords:0, points:0}, accountedBonus = 0;
    try {
        const savedStats = JSON.parse(localStorage.getItem(statsKey) || 'null');
        if (savedStats && Number.isSafeInteger(savedStats.correctWords) && savedStats.correctWords >= 0 &&
            Number.isSafeInteger(savedStats.points) && savedStats.points >= 0) playerStats = savedStats;
    } catch {}
    let savedStatsJSON = JSON.stringify(playerStats);
    function updatePlayerStats() {
        const gained = Math.max(0, bonusPoints - accountedBonus);
        playerStats.points += gained;
        accountedBonus = bonusPoints;
        const json = JSON.stringify(playerStats);
        if (json === savedStatsJSON) return;
        try { localStorage.setItem(statsKey, json); savedStatsJSON = json; } catch {}
    }
    function readSavedWhackProgress() {
        try {
            const data = JSON.parse(localStorage.getItem(progressKey) || 'null');
            if (!data || data.version !== 1 || !Array.isArray(data.questions) ||
                !data.questions.length || data.questions.length > 50 || !Number.isInteger(data.round) ||
                data.round < 0 || data.round >= data.questions.length) return null;
            if (!data.questions.every(q => q && wordSet.has(q.answer) && Array.isArray(q.choices) &&
                q.choices.length === 7 && new Set(q.choices).size === 7 &&
                q.choices.includes(q.answer) && q.choices.every(w => wordSet.has(w)))) return null;
            for (const key of ['score', 'bonusPoints', 'freezeCharges', 'correctWordStreak', 'freezeWordStreak', 'elapsedMs']) {
                if (!Number.isFinite(data[key]) || data[key] < 0) return null;
            }
            if (data.score !== data.round || !Number.isInteger(data.freezeCharges) ||
                !Number.isInteger(data.correctWordStreak) || data.correctWordStreak > 9 ||
                !Number.isInteger(data.freezeWordStreak) || data.freezeWordStreak > 2) return null;
            data.questions = data.questions.map(q => ({answer: q.answer, choices: q.choices, pool: availableWords}));
            data.backgroundSequence = Array.isArray(data.backgroundSequence) ?
                data.backgroundSequence.filter(name => backgrounds.includes(name)) : [];
            return data;
        } catch { return null; }
    }
    function writeSavedWhackProgress(state) {
        try { localStorage.setItem(progressKey, JSON.stringify(state)); return true; } catch { return false; }
    }
    function clearSavedWhackProgress() {
        try { localStorage.removeItem(progressKey); return true; } catch { return false; }
    }
    function saveWhackProgress() {
        if (!questions.length || round >= questions.length) return;
        if (stopped && !answered) return;
        let savedRound = round;
        if (answered) {
            savedRound = round + 1;
            if (savedRound >= questions.length) {
                clearSavedWhackProgress();
                return;
            }
        }
        writeSavedWhackProgress({
            version: 1,
            questions: questions.map(({answer, choices}) => ({answer, choices})),
            round: savedRound,
            score,
            bonusPoints,
            freezeCharges,
            correctWordStreak,
            freezeWordStreak,
            backgroundSequence,
            elapsedMs: elapsedMs + (clockStarted ? Date.now() - clockStarted : 0)
        });
    }
    function getQuestions() {
        if (availableWords.length < 7) return [];
        // Each round has seven distinct recorded words, including the answer.
        // The full audio collection remains available as the replacement pool.
        const selection = shuffle(availableWords);
        const roundCount = Math.min(50, selection.length);
        return selection.slice(0, roundCount).map(answer => {
            const others = shuffle(availableWords.filter(word => word !== answer));
            return {
                family: 'recorded words', answer,
                choices: shuffle([answer, ...others.slice(0, 6)]),
                pool: availableWords
            };
        });
    }
    function stopSound() {
        speechToken++;
        if (activeAudio) {
            activeAudio.pause();
            activeAudio = null;
        }
        if ('speechSynthesis'in window)window.speechSynthesis.cancel();
    }
    function speakWord() {
        if (isPaused() || stopped || answered || !questions[round])return;
        stopSound();
        let word = questions[round].answer, token = speechToken;
        let sound = new Audio('../audio/words/' + encodeURIComponent(word.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.mp3'));
        activeAudio = sound;
        sound.play().catch (() => {
            if (token !== speechToken || stopped)return;
            activeAudio = null;
            if ('speechSynthesis'in window) {
                let u = new SpeechSynthesisUtterance(word);
                u.lang = 'en-US';
                u.rate = .8;
                window.speechSynthesis.speak(u);
            }
        });
    }
    function face(slot, file) {
        const img = slot.querySelector('.mole-body img');
        if (img && img.dataset.face !== file) {
            img.src = folders + 'moles/' + file;
            img.dataset.face = file;
        }
    }
    // Special reactions temporarily override slow, independent idle expressions.
    const reactionTimers = new Map();
    let idleInterval = null;
    function availableSlots(exclude = []) {
        return[...grid.children].filter(s => s.isConnected && !s.classList.contains('down') && !s.classList.contains('rising') && !exclude.includes(s));
    }
    function clearReaction(slot) {
        if (reactionTimers.has(slot)) {
            clearTimeout(reactionTimers.get(slot));
            reactionTimers.delete(slot);
        }
        slot.dataset.reaction = '';
    }
    function react(slot, img, duration = 1000) {
        if (!slot || slot.classList.contains('down'))return;
        clearReaction(slot);
        slot.dataset.reaction = 'yes';
        face(slot, img);
        const t = setTimeout(() => {
            reactionTimers.delete(slot);
            slot.dataset.reaction = '';
            if (slot.isConnected && !slot.classList.contains('down'))face(slot, random(faces));
        }, duration);
        reactionTimers.set(slot, t);
    }
    function playHitFrames(slot) {
        // The one-second delay is applied at choose(), before starting all reactions.
        const hitReactionDelay = 0;
        clearReaction(slot);
        slot.dataset.reaction = 'yes';
        hitFaces.forEach((img, i) => {
            const t = setTimeout(() => {
                if (slot.isConnected)face(slot, img);
            }, hitReactionDelay + i * 360);
            faceTimers.push(t);
        });
        const t = setTimeout(() => {
            slot.dataset.reaction = '';
            if (slot.isConnected && !slot.classList.contains('down'))face(slot, random(faces));
        }, hitReactionDelay + hitFaces.length * 360 + 100);
        faceTimers.push(t);
    }
    function nearestOther(slot) {
        const rect = slot.getBoundingClientRect();
        const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
        let nearest, nearestDistance = Infinity;
        for (const candidate of availableSlots([slot])) {
            if (candidate.dataset.reaction) continue;
            const bounds = candidate.getBoundingClientRect();
            const dx = bounds.left + bounds.width / 2 - x;
            const dy = bounds.top + bounds.height / 2 - y;
            const distance = dx * dx + dy * dy;
            if (distance < nearestDistance) {
                nearest = candidate;
                nearestDistance = distance;
            }
        }
        return nearest;
    }
    function startIdleFaces() {
        clearInterval(idleInterval);
        // Each tick updates at most one idle mole, roughly every 3–6 seconds.
        function tick() {
            if (isPaused() || stopped || answered)return;
            const idle = availableSlots().filter(s => !s.dataset.reaction);
            if (idle.length) {
                const slot = random(idle);
                face(slot, random(faces));
            }
        }
        function schedule() {
            if (isPaused() || stopped || answered)return;
            const t = setTimeout(() => {
                tick();
                schedule();
            }, 3000 + Math.random() * 3000);
            faceTimers.push(t);
        }
        schedule();
    }
    function rememberPointer(e) {
        if (e.pointerType === 'mouse' || e.type === 'pointerdown')lastPointer = {
            x: e.clientX, y: e.clientY
        };
    }
    function clearTimers() {
        for (const timer of popTimers.values())clearTimeout(timer);
        popTimers.clear();
        clearTimeout(advanceTimer);
        faceTimers.forEach(clearTimeout);
        faceTimers = [];
        for (const t of reactionTimers.values())clearTimeout(t);
        reactionTimers.clear();
        clearInterval(idleInterval);
    }
    // Random hole centers only inside cyan-approved areas of each background.
    // Favor a naturally balanced spread with mild variation; never use an unapproved point.
    const permittedPoints = new Map();
    function randomPositions(count, backgroundNumber) {
        let points = permittedPoints.get(backgroundNumber);
        if (!points) {
            points = ((window.WHACK_ALLOWED_POSITIONS || {
        })[backgroundNumber] || []).filter(([x, y]) =>
            x >= SLOT_SIZE.w * 0.6 && x <= 100 - SLOT_SIZE.w * 0.6 &&
            y >= SLOT_SIZE.h * 0.8 && y <= 100 - SLOT_SIZE.h * 0.6);
        permittedPoints.set(backgroundNumber, points);
        }
        if (!points.length) {
            console.error('No permitted hole coordinates for background', backgroundNumber);
            return[];
        }
        let best = [];
        const rounds = 650;
        for (let attempt = 0; attempt < rounds; attempt++) {
            const selected = [];
            const pool = shuffle(points);
            // 20% more separation than previous spacing adjustment, without forcing a grid.
            const xGap = 13.86, yGap = 16.5;
            for (const[x, y]of pool) {
                if (selected.every(p => ((x - p.x) / xGap) ** 2 + ((y - p.y) / yGap) ** 2 >= 1)) {
                    selected.push({
                        x, y, w: SLOT_SIZE.w, h: SLOT_SIZE.h
                    });
                    if (selected.length === count)break;
                }
            }
            if (selected.length === count)return shuffle(selected.map(p => ({
                ...p, x: p.x - p.w / 2, y: p.y - p.h / 2
            })));
            if (selected.length > best.length) {
                best = selected;
            }
        }
        // A tight marked area may not fit seven holes at the preferred spacing.
        // Reduce separation only enough to place all seven INSIDE the approved area.
        if (best.length < count) {
            for (const gap of[0.9, 0.8, 0.7, 0.6, 0.5]) {
                for (let attempt = 0; attempt < 150; attempt++) {
                    const selected = [];
                    for (const[x, y]of shuffle(points)) {
                        if (selected.every(p => ((x - p.x) / (13.86 * gap)) ** 2 + ((y - p.y) / (16.5 * gap)) ** 2 >= 1)) {
                            selected.push({
                                x, y, w: SLOT_SIZE.w, h: SLOT_SIZE.h
                            });
                            if (selected.length === count)break;
                        }
                    }
                    if (selected.length === count)return shuffle(selected.map(p => ({
                        ...p, x: p.x - p.w / 2, y: p.y - p.h / 2
                    })));
                }
            }
        }
        return shuffle(best.map(p => ({
            ...p, x: p.x - p.w / 2, y: p.y - p.h / 2
        })));
    }
    function slotFor(word, i, positions) {
        const p = positions[i];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mole-slot';
        b.style.setProperty('--x', p.x + '%');
        b.style.setProperty('--y', p.y + '%');
        b.style.setProperty('--w', p.w + '%');
        b.style.setProperty('--h', p.h + '%');
        b.dataset.word = word;
        b.setAttribute('aria-label', 'Whack ' + word);
        b.innerHTML = `<img class="hole-back" src="${folders}holes/newholeback.png" alt=""><div class="mole-body"><img src="${folders}moles/${random(faces)}" alt=""><span class="mole-floating-word"></span></div><img class="hole-front" src="${folders}holes/newholefront.png" alt="">`;
        b.querySelector('.mole-floating-word').textContent = word;
        const hit = e => {
            e.preventDefault();
            e.stopPropagation();
            if (isPaused() || stopped || answered || locked || cooldownActive() || b.classList.contains('down'))return;
            rememberPointer(e);
            strike(e.clientX, e.clientY);
            choose(b, b.dataset.word);
        };
        b.addEventListener('pointerdown', hit);
        b.addEventListener('click', e => {
            // Keyboard and assistive technology generate clicks without a pointer.
            if (e.detail !== 0) return;
            const rect = b.getBoundingClientRect();
            hit({preventDefault() {}, stopPropagation() {}, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, type: 'pointerdown'});
        });
        return b;
    }
    function render() {
        hideSuper();
        removeHintGlow();
        clearTimers();
        cooldownUntil = 0;
        clearTimeout(cooldownTimer);
        hammer.classList.remove('cooldown');
        updateHammerCountdown();
        const backgroundName = backgroundSequence[round % backgroundSequence.length] || backgrounds[round % backgrounds.length];
        gamePositions = randomPositions(7, getBackgroundNumber(backgroundName));
        answered = false;
        stopped = false;
        updateRewards();
        swapping = false;
        locked = false;
        stopped = false;
        const q = questions[round];
        scene.style.backgroundImage = `url('${folders}backgrounds/${backgroundName}')`;
        $('score').textContent = `${round + 1}/${questions.length}`;
        status.textContent = 'Whack the word!';
        if (gamePositions.length < q.choices.length) {
            stopped = true; clockPause();
            status.textContent = 'Unable to place the moles. Please restart the game.';
            return;
        }
        grid.replaceChildren(...q.choices.map((word, i) => slotFor(word, i, gamePositions)));
        updateStars();
        generateLetters();
        startPopTimers();
        startIdleFaces();
        saveWhackProgress();
        // Announce the target each time a new word round appears.
        // This also runs on the first round and on restart. Browser autoplay
        // restrictions may require an initial user gesture before audio works.
        speakWord();
    }
    function updateStars() {
    }
    // Each mole stays visible for 18–22 seconds, then dives and rises in the same hole.
    // Keep exactly one correct-answer sign on screen even when that mole changes words.
    function setWord(slot, word) {
        slot.dataset.word = word;
        slot.querySelector('.mole-floating-word').textContent = word;
        slot.setAttribute('aria-label', 'Whack ' + word);
        refreshWordHint();
    }
    function newWordFor(slot) {
        const q = questions[round], old = slot.dataset.word, others = [...grid.children].filter(s => s !== slot);
        const occupied = new Set(others.map(s => s.dataset.word));
        if (old === q.answer) {
            const receiver = random(others.filter(s => !s.classList.contains('down')).length ? others.filter(s => !s.classList.contains('down')): others);
            const replacement = receiver.dataset.word;
            setWord(receiver, q.answer);
            return replacement;
        }
        const candidates = q.pool.filter(w => w !== old && w !== q.answer && !occupied.has(w));
        const fallback = q.pool.filter(w => w !== old && w !== q.answer);
        return random(candidates.length ? candidates: fallback.length ? fallback: [old]);
    }
    function schedulePop(slot, first = false) {
        if (isPaused() || stopped || answered)return;
        // Initial cycles are staggered: some moles start underground immediately.
        const wait = 18000 + Math.random() * 4000;
        const timer = setTimeout(() => {
            popTimers.delete(slot);
            if (isPaused() || stopped || answered || !slot.isConnected)return;
            if (frozen) { schedulePop(slot); return; }
            if (slot.classList.contains('is-wrong') || locked) {
                schedulePop(slot, true);
                return;
            }
            slot.classList.add('down');
            clearReaction(slot);
            // Change the word as soon as the mole hides, not when it rises again.
            setWord(slot, newWordFor(slot));
            const upTimer = setTimeout(() => {
                if (isPaused() || stopped || answered || !slot.isConnected)return;
                slot.classList.remove('down');
                slot.classList.add('rising');
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    slot.classList.remove('rising');
                    face(slot, random(faces));
                }));
                schedulePop(slot);
            }, 900);
            faceTimers.push(upTimer);
        }, wait);
        popTimers.set(slot, timer);
    }
    function startPopTimers() {
        const slots = [...grid.children];
        // Different initial states ensure the holes do not all move together.
        const initialDown = new Set(shuffle(slots).slice(0, 1 + Math.floor(Math.random() * 3)));
        for (const slot of slots) {
            if (initialDown.has(slot)) {
                slot.classList.add('down');
                setWord(slot, newWordFor(slot));
                const timer = setTimeout(() => {
                        if (isPaused() || stopped || answered || !slot.isConnected)return;
                    setWord(slot, newWordFor(slot));
                    slot.classList.remove('down');
                    face(slot, random(faces));
                    schedulePop(slot);
                }, 900 + Math.random() * 1500);
                faceTimers.push(timer);
            }
            else schedulePop(slot, true);
        }
    }
    function strike(clientX, clientY) {
        const rect = scene.getBoundingClientRect();
        let x = clientX - rect.left, y = clientY - rect.top;
        clearTimeout(hammerTimer);
        hammer.style.opacity = '1';
        let frames = [1, 2, 3, 4, 5], step = 0;
        function animate() {
            if (step >= frames.length) {
                hammerTimer = setTimeout(() => hammer.style.opacity = '0', 100);
                return;
            }
            const t = step / (frames.length - 1);
            hammerFrame.src = folders + 'hammers/' + frames[step] + '.png';
            hammer.style.left = (x + Math.max(0, 1 - t) * Math.min(rect.width * .10, 130)) + 'px';
            const finalFrameDownOffset = 75;
            hammer.style.top = (y - Math.max(0, 1 - t) * Math.min(rect.height * .18, 150)
                + (frames[step] === 5 ? finalFrameDownOffset : 0)) + 'px';
            step++;
            hammerTimer = setTimeout(animate, 70);
        }
        animate();
    }
    function choose(slot, word) {
        const correct = word === questions[round].answer;
        locked = true;
        // Keep game scoring/hammer immediate, but delay the visible mole reactions.
        const moleReactionDelay = 500; // milliseconds; 1000 = 1 second
        const neighbor = nearestOther(slot);
        // Reserve the two moles so idle animations don't overwrite the delay.
        slot.dataset.reaction = 'yes';
        if (neighbor) neighbor.dataset.reaction = 'yes';
        faceTimers.push(setTimeout(() => {
            if (!slot.isConnected) return;
            playHitFrames(slot);
            if (neighbor && neighbor.isConnected) react(neighbor, 'nexttohit.png', 2200);
        }, moleReactionDelay));
        if (correct) {
            removeHintGlow();
            answered = true;
            // Stop ordinary pop/idle timers, but retain the just-created hit/reaction frames.
            for (const timer of popTimers.values())clearTimeout(timer);
            popTimers.clear();
            score++;
            playerStats.correctWords++;
            correctWordStreak++;
            // Reward every correctly selected mole word.
            bonusPoints += 10;
            freezeWordStreak++;
            if (freezeWordStreak === 3) { freezeCharges++; freezeWordStreak = 0; }
            // At 5 correct, award +50 but keep counting toward the 10-word reward.
            // At 10 correct, award +200 and restart the consecutive-word streak.
            const lightningReward = correctWordStreak === 10 ? 200 : correctWordStreak === 5 ? 50 : 0;
            if (lightningReward) bonusPoints += lightningReward;
            if (lightningReward === 200) correctWordStreak = 0;
            endFreeze();
            updateRewards();
            updateStars();
            $('score').textContent = `${round + 1}/${questions.length}`;
            slot.classList.add('is-hit');
            status.textContent = '⭐ Great job! ⭐';
            stopSound();
            playEffect('correct-word');
            playEffect(lightningReward ? 'lightning' : 'super');
            if (lightningReward) playEffect('bonus-50'); // Same audio for +50 and +200.
            showSuper(lightningReward);
            for (const b of grid.children)b.disabled = true;
            advanceTimer = setTimeout(() => {
                round++;
                if (round >= questions.length)finish();
                else render();
            }, 3000);
        }
        else {
            correctWordStreak = 0;
            freezeWordStreak = 0;
            playEffect('wrong-word');
            // Reinforce the target on every incorrect hammer hit, in every round.
            // Delay briefly so the wrong-hit sound doesn't drown out the word.
            faceTimers.push(setTimeout(() => {
                if (!stopped && !answered) speakWord();
            }, 250));
            slot.classList.add('is-wrong');
            status.textContent = 'Try again!';
            // Exactly one OTHER mole laughs immediately after a wrong hit.
            // Exclude the impacted mole and the nearest mole showing nexttohit.png.
            const laughing = shuffle(availableSlots([slot, neighbor].filter(Boolean)).filter(s => !s.dataset.reaction)).slice(0, 1);
            laughing.forEach(s => {
                s.dataset.reaction = 'yes';
                faceTimers.push(setTimeout(() => {
                    if (s.isConnected) react(s, 'haha.png', 2200);
                }, moleReactionDelay));
            });
            setCooldown(3);
            saveWhackProgress();
            const t = setTimeout(() => {
                if (!answered && !stopped) {
                    slot.classList.remove('is-wrong');
                    status.textContent = 'Whack the word!';
                }
                locked = false;
            }, 1600);
            faceTimers.push(t);
        }
    }
    function finish() {
        endFreeze();
        removeHintGlow();
        clockPause();
        cooldownUntil = 0;
        updateHammerCountdown();
        letterLayer.replaceChildren();
        hideSuper();
        clearTimers();
        stopSound();
        stopped = true;
        $('resultMessage').textContent = `🎉 You found ${score} / ${questions.length} words!`;
        $('result').hidden = false;
        status.textContent = 'Great playing!';
        clearSavedWhackProgress();
        playEffect('game-complete');
    }
    function restart(forceNew = false) {
        endFreeze();
        stopEffects();
        hideSuper();
        clearTimers();
        stopSound();
        $('result').hidden = true;
        $('exitMenu').hidden = true;

        const saved = !forceNew ? readSavedWhackProgress() : null;
        if (forceNew) clearSavedWhackProgress();

        if (saved) {
            questions = saved.questions;
            backgroundSequence = Array.isArray(saved.backgroundSequence) && saved.backgroundSequence.length ? saved.backgroundSequence.slice() : shuffle(backgrounds);
            lastPointer = null;
            round = Math.max(0, Math.min(saved.round, saved.questions.length - 1));
            score = Number(saved.score) || 0;
            freezeCharges = Number(saved.freezeCharges) || 0;
            bonusPoints = Number(saved.bonusPoints) || 0;
            correctWordStreak = Number(saved.correctWordStreak) || 0;
            freezeWordStreak = Number(saved.freezeWordStreak) || 0;
            elapsedMs = Number(saved.elapsedMs) || 0;
        } else {
            freezeCharges = 0;
            bonusPoints = 0;
            correctWordStreak = 0;
            freezeWordStreak = 0;
            elapsedMs = 0;
            questions = getQuestions();
            if (!questions.length) {
                stopped = true;
                $('resultMessage').textContent = 'No recordings found. Check word-list.js and audio/words.';
                $('result').hidden = false;
                status.textContent = 'Word recordings not found';
                return;
            }
            backgroundSequence = shuffle(backgrounds);
            lastPointer = null;
            round = 0;
            score = 0;
        }

        accountedBonus = bonusPoints;
        clockStarted = 0;
        clockStart();
        updateRewards();
        render();
    }
    scene.addEventListener('pointermove', rememberPointer);
    scene.addEventListener('pointerdown', e => {
        // Only the open background, mole area, and dirt/hole imagery replay
        // the prompt. Buttons, floating letters, signs, bonuses, and HUD do not.
        // Ignore the entire timer plaque, including its image and clock digits.
        if (e.target.closest('.timer-area')) return;
        const onBackground = e.target === scene || e.target === grid;
        const onDirt = !!e.target.closest('.hole-back, .hole-front');
        if (!onBackground && !onDirt) return;
        if (isPaused() || stopped || answered || locked || cooldownActive() || swapping) return;
        rememberPointer(e);
        strike(e.clientX, e.clientY);
        speakWord();
    });
    // A live mole's pointer handler handles hits. A wrong mole replays the word
    // via choose(); a correct mole never replays it.
    $('listen').addEventListener('click', speakWord);
    function returnToWordFamilies() {
        if (window.parent !== window) window.parent.postMessage({type:'wordfamilies-whack-exit'}, '*');
        else location.href = '../index.html';
    }
    window.addEventListener('message', event => {
        if (event.source !== window.parent || event.data?.type !== 'wordfamilies-whack-save') return;
        pauseGame('closing');
        window.parent.postMessage({type:'wordfamilies-whack-saved'}, '*');
    });
    $('exit').addEventListener('click', () => {
        clockPause();
        saveWhackProgress();
        stopEffects(); endFreeze(); hideSuper(); clearTimers(); stopSound();
        returnToWordFamilies();
    });
    $('resume').addEventListener('click', () => {
        $('exitMenu').hidden = true;
        stopped = false;
        updateRewards();
        updateHammerCountdown();
        clockStart();
        if (!answered) {
            startPopTimers();
        }
        else {
            advanceTimer = setTimeout(() => {
                round++;
                if (round >= questions.length)finish();
                else render();
            }, 3000);
        }
    });
    $('restart').addEventListener('click', () => restart(true));
    $('playAgain').addEventListener('click', () => restart(true));
    $('leave').addEventListener('click', () => {
        clockPause();
        saveWhackProgress();
        stopSound();
        returnToWordFamilies();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { pauseGame('hidden'); infoAudio.pause(); }
        else resumeGame('hidden');
    });
    window.addEventListener('pagehide', () => { clockPause(); saveWhackProgress(); });
    clockInterval = setInterval(clockTick, 250);
    restart();
})();
