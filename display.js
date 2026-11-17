// If the Lucide icon CDN could not load (offline venue), keep the rest of the screen working
if (typeof window.lucide === 'undefined') {
  window.lucide = { createIcons() {} };
}

/**
 * Arena Projector Display Client Controller
 * Listens to Real-time Sync Bus and renders Arena Display with Giant Scores & Timer
 */

const dispState = {
  settings: {
    duration: 180,
    setupDuration: 60,
    soundEnabled: true,
    bgmEnabled: true
  },
  timer: {
    phase: 'setup',
    mode: 'countdown',
    remainingMs: 60 * 1000,
    elapsedMs: 0,
    isRunning: false,
    intervalId: null,
    lastTick: null,
    countedSeconds: new Set(),
    isUrgentBeatStarted: false
  },
  teams: {
    blue: { name: 'ทีมพยัคฆ์สีน้ำเงิน', school: 'โรงเรียนตัวแทนสายน้ำเงิน', score: 0, status: 'READY' },
    red: { name: 'ทีมอินทรีแดงเพลิง', school: 'โรงเรียนตัวแทนสายแดง', score: 0, status: 'READY' }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  // Register with parent controller window immediately
  if (window.opener && !window.opener.closed) {
    try {
      window.opener.__activeProjectorDisplays = window.opener.__activeProjectorDisplays || [];
      if (!window.opener.__activeProjectorDisplays.includes(window)) {
        window.opener.__activeProjectorDisplays.push(window);
      }
    } catch (e) {}
  }

  initDisplayState();
  initSyncListeners();
  setupDisplayShortcuts();
  startLiveScoreWatcher();

  // Request latest state from controller
  arenaSync.emit('REQUEST_STATE');

  // Connected (or re-connected) to the LAN relay: ask the controller for the current state again
  arenaSync.on('LAN_CONNECTED', () => arenaSync.emit('REQUEST_STATE'));

  // Browsers block sound until the page gets a click / key press once — unlock it on the first one
  const unlockAudio = () => {
    try { sound.init(); } catch (e) {}
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  lucide.createIcons();
});

// Direct hooks for controller window to push instant score updates (0ms delay)
window.updateArenaScoreFromController = function(blueScore, redScore) {
  const b = Number(blueScore) || 0;
  const r = Number(redScore) || 0;
  dispState.teams.blue.score = b;
  dispState.teams.red.score = r;
  renderScores();
};
window.handleExternalScoreUpdate = window.updateArenaScoreFromController;

// Manual trigger to force score sync from parent window
window.forceSyncScoresNow = function() {
  sound.click();
  // 1. Direct DOM check from controller
  if (window.opener && !window.opener.closed) {
    try {
      const opDoc = window.opener.document;
      if (opDoc) {
        const bEl = opDoc.getElementById('blueTotalScore');
        const rEl = opDoc.getElementById('redTotalScore');
        if (bEl && rEl) {
          dispState.teams.blue.score = parseInt(bEl.innerText, 10) || 0;
          dispState.teams.red.score = parseInt(rEl.innerText, 10) || 0;
          renderScores();
        }
      }
    } catch (e) {}
  }
  // 2. Storage keys
  try {
    const rawB = localStorage.getItem('robot_live_blue_score');
    const rawR = localStorage.getItem('robot_live_red_score');
    if (rawB !== null && rawR !== null) {
      dispState.teams.blue.score = parseInt(rawB, 10) || 0;
      dispState.teams.red.score = parseInt(rawR, 10) || 0;
      renderScores();
    }
  } catch (e) {}

  arenaSync.emit('REQUEST_STATE');
};

function startLiveScoreWatcher() {
  setInterval(() => {
    // 1. Direct window.opener DOM read (Ultimate 0ms sync from referee screen)
    if (window.opener && !window.opener.closed) {
      try {
        const opDoc = window.opener.document;
        if (opDoc) {
          const bEl = opDoc.getElementById('blueTotalScore');
          const rEl = opDoc.getElementById('redTotalScore');
          if (bEl && rEl) {
            const b = parseInt(bEl.innerText, 10);
            const r = parseInt(rEl.innerText, 10);
            if (!isNaN(b) && !isNaN(r)) {
              if (dispState.teams.blue.score !== b || dispState.teams.red.score !== r) {
                dispState.teams.blue.score = b;
                dispState.teams.red.score = r;
                renderScores();
                return;
              }
            }
          }
        }
      } catch (e) {}

      // 2. Direct memory function check
      try {
        if (typeof window.opener.getLatestArenaState === 'function') {
          const live = window.opener.getLatestArenaState();
          if (live && live.teams) {
            const b = Number(live.teams.blue.score) || 0;
            const r = Number(live.teams.red.score) || 0;
            if (dispState.teams.blue.score !== b || dispState.teams.red.score !== r) {
              dispState.teams.blue.score = b;
              dispState.teams.red.score = r;
              renderScores();
              return;
            }
          }
        }
      } catch (e) {}
    }

    // 3. Atomic LocalStorage keys
    try {
      const rawB = localStorage.getItem('robot_live_blue_score');
      const rawR = localStorage.getItem('robot_live_red_score');
      if (rawB !== null && rawR !== null) {
        const b = parseInt(rawB, 10);
        const r = parseInt(rawR, 10);
        if (!isNaN(b) && !isNaN(r)) {
          if (dispState.teams.blue.score !== b || dispState.teams.red.score !== r) {
            dispState.teams.blue.score = b;
            dispState.teams.red.score = r;
            renderScores();
          }
        }
      }
    } catch (e) {}
  }, 80);
}

function initDisplayState() {
  // Read Atomic live scores first
  try {
    const liveB = localStorage.getItem('robot_live_blue_score');
    const liveR = localStorage.getItem('robot_live_red_score');
    if (liveB !== null) dispState.teams.blue.score = parseInt(liveB, 10) || 0;
    if (liveR !== null) dispState.teams.red.score = parseInt(liveR, 10) || 0;
  } catch (e) {}

  try {
    const saved = localStorage.getItem('robot_scoreboard_state_v5');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.tournamentTitle) document.getElementById('dispTournamentTitle').innerText = parsed.tournamentTitle;
      if (parsed.categoryTag) document.getElementById('dispCategory').innerText = parsed.categoryTag;
      if (parsed.roundTag) document.getElementById('dispRound').innerText = parsed.roundTag;

      if (parsed.teams) {
        if (parsed.teams.blue) {
          dispState.teams.blue.name = parsed.teams.blue.name || dispState.teams.blue.name;
          dispState.teams.blue.school = parsed.teams.blue.school || dispState.teams.blue.school;
          if (parsed.teams.blue.score !== undefined) dispState.teams.blue.score = parsed.teams.blue.score;
        }
        if (parsed.teams.red) {
          dispState.teams.red.name = parsed.teams.red.name || dispState.teams.red.name;
          dispState.teams.red.school = parsed.teams.red.school || dispState.teams.red.school;
          if (parsed.teams.red.score !== undefined) dispState.teams.red.score = parsed.teams.red.score;
        }
      }

      if (parsed.settings) {
        dispState.settings = Object.assign(dispState.settings, parsed.settings);
        sound.enabled = dispState.settings.soundEnabled;
        sound.bgmEnabled = dispState.settings.bgmEnabled;
        if (dispState.settings.volume !== undefined) sound.setVolume(dispState.settings.volume);
      }
    }
  } catch (e) {
    console.error('Init display error', e);
  }

  // Also check direct window.opener memory on startup
  if (window.opener && !window.opener.closed) {
    try {
      if (typeof window.opener.getLatestArenaState === 'function') {
        const live = window.opener.getLatestArenaState();
        if (live && live.teams) {
          if (live.teams.blue) {
            dispState.teams.blue.name = live.teams.blue.name;
            dispState.teams.blue.school = live.teams.blue.school;
            dispState.teams.blue.score = live.teams.blue.score;
          }
          if (live.teams.red) {
            dispState.teams.red.name = live.teams.red.name;
            dispState.teams.red.school = live.teams.red.school;
            dispState.teams.red.score = live.teams.red.score;
          }
        }
      }
    } catch (e) {}
  }

  renderTeamNames();
  renderScores();
  updateDisplayClock();
  updateDisplaySoundIcons();
}

function initSyncListeners() {
  // 1. Full State Sync
  arenaSync.on('FULL_STATE_SYNC', (data) => {
    if (!data) return;
    if (data.tournamentTitle) document.getElementById('dispTournamentTitle').innerText = data.tournamentTitle;
    if (data.categoryTag) document.getElementById('dispCategory').innerText = data.categoryTag;
    if (data.roundTag) document.getElementById('dispRound').innerText = data.roundTag;

    if (data.teams) {
      if (data.teams.blue) {
        dispState.teams.blue.name = data.teams.blue.name;
        dispState.teams.blue.school = data.teams.blue.school;
        dispState.teams.blue.score = data.teams.blue.score;
        dispState.teams.blue.status = data.teams.blue.status || 'READY';
      }
      if (data.teams.red) {
        dispState.teams.red.name = data.teams.red.name;
        dispState.teams.red.school = data.teams.red.school;
        dispState.teams.red.score = data.teams.red.score;
        dispState.teams.red.status = data.teams.red.status || 'READY';
      }
      renderTeamNames();
      renderScores();
    }

    if (data.timer) {
      applyTimerState(data.timer);
    }

    // Master volume chosen in the controller's settings
    if (data.settings && data.settings.volume !== undefined) {
      dispState.settings.volume = sound.setVolume(data.settings.volume);
    }
  });

  // Volume slider moved in the controller's settings
  arenaSync.on('VOLUME_UPDATE', (data) => {
    if (data && data.volume !== undefined) {
      dispState.settings.volume = sound.setVolume(data.volume);
    }
  });

  // 2. Scores Changed
  arenaSync.on('SCORE_UPDATE', (scores) => {
    if (!scores) return;
    if (scores.blue !== undefined) dispState.teams.blue.score = Number(scores.blue) || 0;
    if (scores.red !== undefined) dispState.teams.red.score = Number(scores.red) || 0;
    renderScores();
  });

  // 3. Team Info (Names, Statuses)
  arenaSync.on('TEAM_UPDATE', (teams) => {
    if (teams.blue) {
      dispState.teams.blue.name = teams.blue.name;
      dispState.teams.blue.school = teams.blue.school;
      if (teams.blue.status) dispState.teams.blue.status = teams.blue.status;
    }
    if (teams.red) {
      dispState.teams.red.name = teams.red.name;
      dispState.teams.red.school = teams.red.school;
      if (teams.red.status) dispState.teams.red.status = teams.red.status;
    }
    renderTeamNames();
  });

  // 4. Timer Events
  arenaSync.on('TIMER_START', () => {
    startDisplayTimer();
  });

  arenaSync.on('TIMER_PAUSE', () => {
    pauseDisplayTimer();
  });

  arenaSync.on('TIMER_RESET', (data) => {
    pauseDisplayTimer();
    if (data) {
      dispState.timer.remainingMs = data.remainingMs;
      dispState.timer.elapsedMs = data.elapsedMs || 0;
      dispState.timer.phase = data.phase || dispState.timer.phase;
    }
    updateDisplayClock();
    updatePhaseUI();
  });

  arenaSync.on('TIMER_PHASE', (phaseData) => {
    pauseDisplayTimer();
    dispState.timer.phase = phaseData.phase;
    dispState.timer.mode = phaseData.mode;
    dispState.timer.remainingMs = phaseData.remainingMs;
    dispState.timer.elapsedMs = 0;
    dispState.timer.countedSeconds.clear();
    dispState.timer.isUrgentBeatStarted = false;
    updatePhaseUI();
    updateDisplayClock();
  });

  arenaSync.on('TIMER_DRIFT_SYNC', (timerData) => {
    // Only adjust if drift > 300ms
    const diff = Math.abs(dispState.timer.remainingMs - timerData.remainingMs);
    if (diff > 300) {
      dispState.timer.remainingMs = timerData.remainingMs;
      dispState.timer.elapsedMs = timerData.elapsedMs;
      updateDisplayClock();
    }
  });

  // 5. Titles Sync
  arenaSync.on('TITLE_UPDATE', (titles) => {
    if (titles.title) document.getElementById('dispTournamentTitle').innerText = titles.title;
    if (titles.category) document.getElementById('dispCategory').innerText = titles.category;
    if (titles.round) document.getElementById('dispRound').innerText = titles.round;
  });

  // 6. Audio Events Sync
  arenaSync.on('AUDIO_TRIGGER', (evt) => {
    if (evt.type === 'whistle') sound.startWhistle();
    else if (evt.type === 'setup_chime') sound.startSetupChime();
    else if (evt.type === 'buzzer') sound.buzzer();
    else if (evt.type === 'victory') sound.victory();
    else if (evt.type === 'foul') sound.foulAlert();
    else if (evt.type === 'score') sound.scoreChime();
    else if (evt.type === 'beep') sound.countdownBeep(evt.isFinal);
    else if (evt.type === 'cheer_applause') {
      sound.cheerAndApplause();
      pauseDisplayTimer();
      launchDisplayConfetti();
    }
    else if (evt.type === 'beat_start') {
      const phase = evt.phase || dispState.timer.phase || 'match';
      if (dispState.settings.bgmEnabled) sound.startArenaBeat(phase, evt.isUrgent);
      updateBeatWaveVisual(true, phase === 'setup' ? 'SET UP CALIBRATION (112 BPM)' : (evt.isUrgent ? 'URGENT TENSION (138 BPM)' : 'MATCH BATTLE BEAT (128 BPM)'));
    }
    else if (evt.type === 'beat_stop') {
      sound.stopArenaBeat();
      updateBeatWaveVisual(false);
    }
  });

  // 7. Perfect 120 Points Event
  arenaSync.on('PERFECT_120_EVENT', (data) => {
    pauseDisplayTimer();
    const statusEl = document.getElementById(data.team === 'blue' ? 'dispBlueStatus' : 'dispRedStatus');
    if (statusEl) {
      statusEl.classList.add('finished');
      statusEl.innerText = `🌟 120 คะแนนเต็ม! (${data.time || ''})`;
    }
    launchDisplayConfetti();
  });
}

function applyTimerState(timerData) {
  dispState.timer.phase = timerData.phase || dispState.timer.phase;
  dispState.timer.mode = timerData.mode || dispState.timer.mode;
  dispState.timer.remainingMs = timerData.remainingMs;
  dispState.timer.elapsedMs = timerData.elapsedMs || 0;
  updatePhaseUI();
  updateDisplayClock();

  if (timerData.isRunning && !dispState.timer.isRunning) {
    startDisplayTimer();
  } else if (!timerData.isRunning && dispState.timer.isRunning) {
    pauseDisplayTimer();
  }
}

function renderTeamNames() {
  document.getElementById('dispBlueName').innerText = dispState.teams.blue.name;
  document.getElementById('dispBlueSchool').innerText = dispState.teams.blue.school;
  document.getElementById('dispRedName').innerText = dispState.teams.red.name;
  document.getElementById('dispRedSchool').innerText = dispState.teams.red.school;

  const bStatus = document.getElementById('dispBlueStatus');
  const rStatus = document.getElementById('dispRedStatus');

  bStatus.innerText = dispState.teams.blue.status;
  if (dispState.teams.blue.status.includes('FINISHED')) bStatus.classList.add('finished');
  else bStatus.classList.remove('finished');

  rStatus.innerText = dispState.teams.red.status;
  if (dispState.teams.red.status.includes('FINISHED')) rStatus.classList.add('finished');
  else rStatus.classList.remove('finished');
}

function renderScores() {
  const elBlue = document.getElementById('dispBlueScore');
  const elRed = document.getElementById('dispRedScore');

  const bStr = String(dispState.teams.blue.score !== undefined ? dispState.teams.blue.score : 0);
  const rStr = String(dispState.teams.red.score !== undefined ? dispState.teams.red.score : 0);

  if (elBlue) {
    if (elBlue.innerText.trim() !== bStr) {
      elBlue.innerText = bStr;
      elBlue.classList.add('bump');
      setTimeout(() => elBlue.classList.remove('bump'), 220);
    }
  }

  if (elRed) {
    if (elRed.innerText.trim() !== rStr) {
      elRed.innerText = rStr;
      elRed.classList.add('bump');
      setTimeout(() => elRed.classList.remove('bump'), 220);
    }
  }
}

function updatePhaseUI() {
  const neonTitle = document.getElementById('dispNeonTitle');
  const subText = document.getElementById('dispPhaseSub');
  const clock = document.getElementById('dispClock');
  const pillText = document.getElementById('dispPhasePillText');

  if (dispState.timer.phase === 'setup') {
    neonTitle.innerText = 'SET UP';
    neonTitle.className = 'canva-neon-title pulse';
    subText.innerText = 'ช่วงเวลาจัดเตรียมหุ่นยนต์และอุปกรณ์ (SET UP TIME)';
    clock.className = 'canva-digital-clock setup-mode';
    pillText.innerText = 'SET UP (1 นาที)';
  } else if (dispState.timer.phase === 'ready') {
    neonTitle.innerText = 'READY';
    neonTitle.className = 'canva-neon-title pulse';
    subText.innerText = 'เตรียมพร้อม ปล่อยมือจากหุ่นยนต์';
    clock.className = 'canva-digital-clock warning';
    pillText.innerText = 'READY (เตรียมปล่อยตัว)';
  } else if (dispState.timer.phase === 'match') {
    neonTitle.innerText = 'MATCH TIME';
    neonTitle.className = 'canva-neon-title';
    subText.innerText = 'เวลาการแข่งขันหุ่นยนต์ ครั้งที่ 5';
    clock.className = 'canva-digital-clock';
    pillText.innerText = 'แข่งขัน (3 นาที)';
  } else if (dispState.timer.phase === 'countup') {
    neonTitle.innerText = 'STOPWATCH';
    neonTitle.className = 'canva-neon-title';
    subText.innerText = 'จับเวลาเดินหน้า (STOPWATCH ARENA)';
    clock.className = 'canva-digital-clock';
    pillText.innerText = 'เดินหน้า (Stopwatch)';
  }
}

function startDisplayTimer() {
  dispState.timer.isRunning = true;
  dispState.timer.lastTick = performance.now();
  dispState.timer.intervalId = requestAnimationFrame(displayTimerTick);

  if (dispState.settings.bgmEnabled) {
    const phase = dispState.timer.phase || 'match';
    sound.startArenaBeat(phase, false);
    updateBeatWaveVisual(true, phase === 'setup' ? 'SET UP CALIBRATION (112 BPM)' : 'MATCH BATTLE BEAT (128 BPM)');
  }
}

function pauseDisplayTimer() {
  dispState.timer.isRunning = false;
  if (dispState.timer.intervalId) {
    cancelAnimationFrame(dispState.timer.intervalId);
    dispState.timer.intervalId = null;
  }
  sound.stopArenaBeat();
  updateBeatWaveVisual(false);
}

function displayTimerTick(timestamp) {
  if (!dispState.timer.isRunning) return;

  const delta = timestamp - (dispState.timer.lastTick || timestamp);
  dispState.timer.lastTick = timestamp;

  if (dispState.timer.mode === 'countdown') {
    dispState.timer.remainingMs = Math.max(0, dispState.timer.remainingMs - delta);
    const secLeft = Math.ceil(dispState.timer.remainingMs / 1000);

    // Urgent speedup in final 30s of match
    if (dispState.timer.phase === 'match' && secLeft <= 30 && secLeft > 0 && !dispState.timer.isUrgentBeatStarted && dispState.settings.bgmEnabled) {
      dispState.timer.isUrgentBeatStarted = true;
      sound.startArenaBeat('match', true);
      updateBeatWaveVisual(true, 'URGENT TENSION (138 BPM)');
    }

    if (dispState.timer.remainingMs <= 0) {
      dispState.timer.remainingMs = 0;
      updateDisplayClock();
      pauseDisplayTimer();

      const neonTitle = document.getElementById('dispNeonTitle');
      if (neonTitle) {
        neonTitle.innerText = 'TIME UP';
        neonTitle.className = 'canva-neon-title pulse';
      }
      return;
    }
  } else {
    dispState.timer.elapsedMs += delta;
  }

  updateDisplayClock();
  dispState.timer.intervalId = requestAnimationFrame(displayTimerTick);
}

function updateDisplayClock() {
  const clockEl = document.getElementById('dispClock');
  let msToShow = dispState.timer.mode === 'countdown' ? dispState.timer.remainingMs : dispState.timer.elapsedMs;

  const minutes = Math.floor(msToShow / 60000);
  const seconds = Math.floor((msToShow % 60000) / 1000);
  const millis = Math.floor((msToShow % 1000) / 10);

  document.getElementById('dispMin').innerText = pad(minutes);
  document.getElementById('dispSec').innerText = pad(seconds);
  document.getElementById('dispMs').innerText = `.${pad(millis)}`;

  if (dispState.timer.mode === 'countdown' && msToShow <= 10000 && msToShow > 0) {
    clockEl.classList.add('warning');
  } else {
    clockEl.classList.remove('warning');
  }
}

function updateBeatWaveVisual(isPlaying, labelText) {
  const wave = document.getElementById('dispBeatWave');
  if (wave) {
    wave.style.display = isPlaying ? 'flex' : 'none';
    if (labelText) {
      const textEl = wave.querySelector('.beat-text');
      if (textEl) textEl.innerText = labelText;
    }
  }
}

function toggleDisplayBeat() {
  const enabled = sound.toggleBgm();
  dispState.settings.bgmEnabled = enabled;
  updateDisplaySoundIcons();
  if (enabled && dispState.timer.isRunning) {
    const phase = dispState.timer.phase || 'match';
    sound.startArenaBeat(phase, false);
    updateBeatWaveVisual(true, phase === 'setup' ? 'SET UP CALIBRATION (112 BPM)' : 'MATCH BATTLE BEAT (128 BPM)');
  } else {
    sound.stopArenaBeat();
    updateBeatWaveVisual(false);
  }
}

function toggleDisplaySound() {
  const enabled = sound.toggle();
  dispState.settings.soundEnabled = enabled;
  updateDisplaySoundIcons();
}

function updateDisplaySoundIcons() {
  const soundIcon = document.getElementById('dispSoundIcon');
  const beatBtn = document.getElementById('dispBeatBtn');
  const beatLabel = document.getElementById('dispBeatLabel');

  if (soundIcon) soundIcon.setAttribute('data-lucide', sound.enabled ? 'volume-2' : 'volume-x');
  if (beatBtn) {
    if (dispState.settings.bgmEnabled) {
      beatBtn.classList.add('active');
      if (beatLabel) beatLabel.innerText = 'ซาวน์แข่ง: เปิด';
    } else {
      beatBtn.classList.remove('active');
      if (beatLabel) beatLabel.innerText = 'ซาวน์แข่ง: ปิด';
    }
  }
  lucide.createIcons();
}

function toggleFullscreen() {
  sound.click();
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => console.log(err));
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
}

function setupDisplayShortcuts() {
  // Stop Space from clicking a focused button on key release
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') e.preventDefault();
  });

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (e.repeat) return;
      // Send toggle command to sync bus so controller also starts/pauses
      arenaSync.emit('REQUEST_TIMER_TOGGLE');
    } else if (['KeyR', 'Digit1', 'Digit2', 'Numpad1', 'Numpad2',
                'KeyW', 'KeyS', 'KeyA', 'KeyD',
                'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      // Reset (R), timer presets (1 = SET UP, 2 = 3 min), Blue (W/S = box +/-, A/D = missions 2/3)
      // and Red (arrow up/down = box +/-, arrow left/right = missions 2/3) are performed by the controller window
      e.preventDefault();
      if (e.repeat) return;
      arenaSync.emit('REQUEST_HOTKEY', { code: e.code });
    } else if (e.code === 'KeyB') {
      e.preventDefault();
      toggleDisplayBeat();
    } else if (e.code === 'KeyM') {
      e.preventDefault();
      toggleDisplaySound();
    }
  });
}

function pad(num) {
  return num < 10 ? '0' + num : num;
}

// Confetti Particle Celebration on Projector Screen
function launchDisplayConfetti() {
  const colors = ['#ffd700', '#00d2ff', '#ff2a5f', '#00ff88', '#ffffff', '#ff00aa', '#ffea00'];
  const confettiCount = 120; // Extra festive on big screen

  for (let i = 0; i < confettiCount; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-particle';
    el.style.left = `${Math.random() * 100}vw`;
    el.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    el.style.animationDuration = `${2.2 + Math.random() * 2.8}s`;
    el.style.animationDelay = `${Math.random() * 0.9}s`;
    el.style.width = `${10 + Math.random() * 12}px`;
    el.style.height = `${10 + Math.random() * 18}px`;
    el.style.boxShadow = '0 0 8px currentColor';
    document.body.appendChild(el);

    setTimeout(() => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }, 5500);
  }
}
