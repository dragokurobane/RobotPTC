/**
 * Robotics Arena Scoreboard & Official Canva Timer Logic (Controller Window)
 * Competition: การแข่งขันหุ่นยนต์ปักธงชัยพิชิตยอดเขาลำพระเพลิง ครั้งที่ 5
 */

// If the Lucide icon CDN could not load (offline venue), do not let icon refreshes crash timer/hotkey code
if (typeof window.lucide === 'undefined') {
  window.lucide = { createIcons() {} };
}

// Application State
const state = {
  settings: {
    duration: 180, // match duration seconds
    setupDuration: 60, // setup duration seconds
    foulPenalty: 5,
    soundEnabled: true,
    bgmEnabled: true // Exciting Arena Tension Beat
  },
  timer: {
    phase: 'setup', // 'setup', 'ready', 'match', 'countup'
    mode: 'countdown', // 'countdown' or 'countup'
    remainingMs: 60 * 1000,
    elapsedMs: 0,
    isRunning: false,
    intervalId: null,
    lastTick: null,
    countedSeconds: new Set(),
    isUrgentBeatStarted: false
  },
  teams: {
    blue: {
      name: 'ทีมพยัคฆ์สีน้ำเงิน (BLUE MECHA)',
      school: 'โรงเรียนตัวแทนสายน้ำเงิน',
      boxes: {
        top: { team: false, w1: false, w2: false },
        mid: { team: false, w1: false, w2: false },
        base: { team: false, w1: false, w2: false }
      },
      egg: false,
      flag: false,
      fouls: 0,
      customOffset: 0,
      finishTime: null
    },
    red: {
      name: 'ทีมอินทรีแดงเพลิง (RED DRAGON)',
      school: 'โรงเรียนตัวแทนสายแดง',
      boxes: {
        top: { team: false, w1: false, w2: false },
        mid: { team: false, w1: false, w2: false },
        base: { team: false, w1: false, w2: false }
      },
      egg: false,
      flag: false,
      fouls: 0,
      customOffset: 0,
      finishTime: null
    }
  },
  history: []
};

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', () => {
  const safe = (fn) => {
    try { fn(); } catch (err) { console.error(`Init step ${fn.name} failed:`, err); }
  };
  safe(setupKeyboardShortcuts);   // first, so hotkeys/header buttons always get attached
  safe(loadFromStorage);
  safe(updateScores);
  safe(updateTimerDisplay);
  safe(syncCanvaTeamDetails);
  safe(updateBeatIcon);
  safe(initCrossWindowSync);
  safe(() => lucide.createIcons());
});

// ================= DUAL MONITOR / PROJECTOR WINDOW =================
let displayWindowRef = null;

function openDisplayWindow() {
  sound.click();
  const blueScore = parseInt(document.getElementById('blueTotalScore').innerText) || 0;
  const redScore = parseInt(document.getElementById('redTotalScore').innerText) || 0;
  try {
    localStorage.setItem('robot_live_blue_score', String(blueScore));
    localStorage.setItem('robot_live_red_score', String(redScore));
    localStorage.setItem('robot_live_score_time', String(Date.now()));
  } catch (e) {}

  if (displayWindowRef && !displayWindowRef.closed) {
    displayWindowRef.focus();
    if (typeof displayWindowRef.updateArenaScoreFromController === 'function') {
      displayWindowRef.updateArenaScoreFromController(blueScore, redScore);
    }
  } else {
    displayWindowRef = window.open('display.html' + location.search, 'RoboticsArenaProjector', 'width=1600,height=900,menubar=no,toolbar=no,location=no,status=no');
    window.__openedChildWindows = window.__openedChildWindows || [];
    if (!window.__openedChildWindows.includes(displayWindowRef)) {
      window.__openedChildWindows.push(displayWindowRef);
    }
  }
  // Send state shortly after opening with multiple staggered retries
  setTimeout(() => broadcastFullState(), 250);
  setTimeout(() => broadcastFullState(), 700);
  setTimeout(() => broadcastFullState(), 1500);
}

// ================= REALTIME SYNC (CROSS-WINDOW BUS) =================
function initCrossWindowSync() {
  // When another window (display screen) requests state
  arenaSync.on('REQUEST_STATE', () => {
    broadcastFullState();
  });

  // When display requests timer start/pause via Spacebar
  arenaSync.on('REQUEST_TIMER_TOGGLE', () => {
    toggleTimer();
  });

  // (Re)connected to the LAN relay: push the current state so projectors that connected earlier catch up
  arenaSync.on('LAN_CONNECTED', () => broadcastFullState());

  // LAN relay status (only when opened from server.js): show how many screens are connected
  const showLanStatus = (st) => {
    const tag = document.getElementById('connTagText');
    if (!tag) return;
    if (st && st.online) {
      const others = Math.max(0, (st.count || 1) - 1);
      tag.innerText = `LAN ONLINE • จอที่เชื่อมต่อ ${others}`;
    } else {
      tag.innerText = 'OFFLINE READY';
    }
  };
  arenaSync.on('LAN_STATUS', showLanStatus);
  // the relay may have connected before this page finished loading — apply the current status now
  showLanStatus({ online: arenaSync.lanOnline, count: arenaSync.lanClients });

  // Other hotkeys pressed while the projector window has focus (R, Q, W, O, P)
  arenaSync.on('REQUEST_HOTKEY', (payload) => {
    if (payload && payload.code) handleHotkey(payload.code);
  });
}

function broadcastFullState() {
  const blueScore = parseInt(document.getElementById('blueTotalScore').innerText) || 0;
  const redScore = parseInt(document.getElementById('redTotalScore').innerText) || 0;
  const blueStatus = document.getElementById('blueStatusTag').innerText;
  const redStatus = document.getElementById('redStatusTag').innerText;

  arenaSync.emit('FULL_STATE_SYNC', {
    tournamentTitle: document.getElementById('tournamentTitle').innerText,
    tournamentSubTitle: document.getElementById('tournamentSubTitle').innerText,
    categoryTag: document.getElementById('categoryTag').innerText,
    roundTag: document.getElementById('roundTag').innerText,
    settings: state.settings,
    teams: {
      blue: {
        name: document.getElementById('blueTeamName').value,
        school: document.getElementById('blueSchoolName').value,
        score: blueScore,
        status: blueStatus
      },
      red: {
        name: document.getElementById('redTeamName').value,
        school: document.getElementById('redSchoolName').value,
        score: redScore,
        status: redStatus
      }
    },
    timer: {
      phase: state.timer.phase,
      mode: state.timer.mode,
      remainingMs: state.timer.remainingMs,
      elapsedMs: state.timer.elapsedMs,
      isRunning: state.timer.isRunning
    }
  });
}

// Expose state globally for cross-window direct memory access
window.getLatestArenaState = function() {
  const blueScore = parseInt(document.getElementById('blueTotalScore').innerText) || 0;
  const redScore = parseInt(document.getElementById('redTotalScore').innerText) || 0;
  return {
    tournamentTitle: document.getElementById('tournamentTitle').innerText,
    tournamentSubTitle: document.getElementById('tournamentSubTitle').innerText,
    categoryTag: document.getElementById('categoryTag').innerText,
    roundTag: document.getElementById('roundTag').innerText,
    settings: state.settings,
    teams: {
      blue: {
        name: document.getElementById('blueTeamName').value,
        school: document.getElementById('blueSchoolName').value,
        score: blueScore,
        status: document.getElementById('blueStatusTag').innerText
      },
      red: {
        name: document.getElementById('redTeamName').value,
        school: document.getElementById('redSchoolName').value,
        score: redScore,
        status: document.getElementById('redStatusTag').innerText
      }
    },
    timer: {
      phase: state.timer.phase,
      mode: state.timer.mode,
      remainingMs: state.timer.remainingMs,
      elapsedMs: state.timer.elapsedMs,
      isRunning: state.timer.isRunning
    }
  };
};

// ================= LOCAL STORAGE =================
function saveToStorage() {
  try {
    const blueScore = parseInt(document.getElementById('blueTotalScore').innerText) || 0;
    const redScore = parseInt(document.getElementById('redTotalScore').innerText) || 0;

    const dataToSave = {
      tournamentTitle: document.getElementById('tournamentTitle').innerText,
      tournamentSubTitle: document.getElementById('tournamentSubTitle').innerText,
      categoryTag: document.getElementById('categoryTag').innerText,
      roundTag: document.getElementById('roundTag').innerText,
      settings: state.settings,
      teams: {
        blue: {
          name: document.getElementById('blueTeamName').value,
          school: document.getElementById('blueSchoolName').value,
          score: blueScore,
          status: document.getElementById('blueStatusTag').innerText
        },
        red: {
          name: document.getElementById('redTeamName').value,
          school: document.getElementById('redSchoolName').value,
          score: redScore,
          status: document.getElementById('redStatusTag').innerText
        }
      },
      timer: {
        phase: state.timer.phase,
        mode: state.timer.mode,
        remainingMs: state.timer.remainingMs,
        elapsedMs: state.timer.elapsedMs,
        isRunning: state.timer.isRunning
      },
      history: state.history
    };
    localStorage.setItem('robot_scoreboard_state_v5', JSON.stringify(dataToSave));
    localStorage.setItem('robot_live_blue_score', String(blueScore));
    localStorage.setItem('robot_live_red_score', String(redScore));
    localStorage.setItem('robot_live_score_time', String(Date.now()));
  } catch (e) {
    console.error('Save to local storage failed', e);
  }
}

function loadFromStorage() {
  try {
    const saved = localStorage.getItem('robot_scoreboard_state_v5');
    if (!saved) return;
    const parsed = JSON.parse(saved);

    if (parsed.tournamentTitle) document.getElementById('tournamentTitle').innerText = parsed.tournamentTitle;
    if (parsed.tournamentSubTitle) document.getElementById('tournamentSubTitle').innerText = parsed.tournamentSubTitle;
    if (parsed.categoryTag) document.getElementById('categoryTag').innerText = parsed.categoryTag;
    if (parsed.roundTag) document.getElementById('roundTag').innerText = parsed.roundTag;

    if (parsed.settings) {
      state.settings = Object.assign(state.settings, parsed.settings);
      document.getElementById('cfgMatchDuration').value = state.settings.duration;
      if (document.getElementById('cfgSetupDuration')) {
        document.getElementById('cfgSetupDuration').value = state.settings.setupDuration || 60;
      }
      document.getElementById('cfgFoulPenalty').value = state.settings.foulPenalty;
      sound.enabled = state.settings.soundEnabled;
      sound.bgmEnabled = state.settings.bgmEnabled !== undefined ? state.settings.bgmEnabled : true;
      updateSoundIcon();
      updateBeatIcon();
    }

    if (parsed.teams) {
      if (parsed.teams.blue) {
        document.getElementById('blueTeamName').value = parsed.teams.blue.name || state.teams.blue.name;
        document.getElementById('blueSchoolName').value = parsed.teams.blue.school || state.teams.blue.school;
      }
      if (parsed.teams.red) {
        document.getElementById('redTeamName').value = parsed.teams.red.name || state.teams.red.name;
        document.getElementById('redSchoolName').value = parsed.teams.red.school || state.teams.red.school;
      }
    }

    if (parsed.history && Array.isArray(parsed.history)) {
      state.history = parsed.history;
    }
  } catch (e) {
    console.error('Load from local storage failed', e);
  }
}

// Auto-save & sync when editable elements change
['tournamentTitle', 'tournamentSubTitle', 'categoryTag', 'roundTag'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('blur', () => {
    saveToStorage();
    arenaSync.emit('TITLE_UPDATE', {
      title: document.getElementById('tournamentTitle').innerText,
      category: document.getElementById('categoryTag').innerText,
      round: document.getElementById('roundTag').innerText
    });
  });
});

['blueTeamName', 'blueSchoolName', 'redTeamName', 'redSchoolName'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', () => {
    saveToStorage();
    syncCanvaTeamDetails();
    broadcastTeamUpdate();
  });
});

function broadcastTeamUpdate() {
  arenaSync.emit('TEAM_UPDATE', {
    blue: {
      name: document.getElementById('blueTeamName').value,
      school: document.getElementById('blueSchoolName').value,
      status: document.getElementById('blueStatusTag').innerText
    },
    red: {
      name: document.getElementById('redTeamName').value,
      school: document.getElementById('redSchoolName').value,
      status: document.getElementById('redStatusTag').innerText
    }
  });
}

function syncCanvaTeamDetails() {
  const blueName = document.getElementById('blueTeamName').value || 'ทีมพยัคฆ์สีน้ำเงิน';
  const blueSchool = document.getElementById('blueSchoolName').value || 'โรงเรียนตัวแทนสายน้ำเงิน';
  const redName = document.getElementById('redTeamName').value || 'ทีมอินทรีแดงเพลิง';
  const redSchool = document.getElementById('redSchoolName').value || 'โรงเรียนตัวแทนสายแดง';

  const elBlueName = document.getElementById('canvaBlueName');
  const elBlueSchool = document.getElementById('canvaBlueSchool');
  const elRedName = document.getElementById('canvaRedName');
  const elRedSchool = document.getElementById('canvaRedSchool');

  if (elBlueName) elBlueName.innerText = blueName;
  if (elBlueSchool) elBlueSchool.innerText = blueSchool;
  if (elRedName) elRedName.innerText = redName;
  if (elRedSchool) elRedSchool.innerText = redSchool;
}

// ================= CANVA TIMER VIEW CONTROLLER =================
function openCanvaView() {
  sound.click();
  const overlay = document.getElementById('canvaTimerView');
  if (overlay) {
    overlay.classList.add('active');
    syncCanvaTeamDetails();
    updateScores();
    updateTimerDisplay();
  }
}

function closeCanvaView() {
  sound.click();
  const overlay = document.getElementById('canvaTimerView');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

function toggleCanvaView() {
  const overlay = document.getElementById('canvaTimerView');
  if (overlay) {
    if (overlay.classList.contains('active')) {
      closeCanvaView();
    } else {
      openCanvaView();
    }
  }
}

// Set Specific Timer Phase (setup, ready, match, countup)
function setTimerPhase(phase, durationSeconds) {
  sound.click();
  pauseTimer();
  state.timer.phase = phase;
  state.timer.isUrgentBeatStarted = false;

  // Deactivate all pills
  document.querySelectorAll('.phase-pill').forEach(btn => btn.classList.remove('active'));

  const neonTitle = document.getElementById('canvaNeonTitle');
  const subText = document.getElementById('canvaPhaseSub');
  const clock = document.getElementById('canvaClock');

  if (phase === 'setup') {
    state.timer.mode = 'countdown';
    state.timer.remainingMs = (durationSeconds || state.settings.setupDuration || 60) * 1000;
    const pill = document.getElementById('pillPhaseSetup');
    if (pill) pill.classList.add('active');

    neonTitle.innerText = 'SET UP';
    neonTitle.className = 'canva-neon-title pulse';
    subText.innerText = 'ช่วงเวลาจัดเตรียมหุ่นยนต์และอุปกรณ์ (SET UP TIME)';
    clock.className = 'canva-digital-clock setup-mode';
    document.getElementById('timerModeLabel').innerText = `ARENA TIMER • SET UP (${durationSeconds || 60} วินาที)`;
  } 
  else if (phase === 'ready') {
    state.timer.mode = 'countdown';
    state.timer.remainingMs = (durationSeconds || 5) * 1000;
    const pill = document.getElementById('pillPhaseReady');
    if (pill) pill.classList.add('active');

    neonTitle.innerText = 'READY';
    neonTitle.className = 'canva-neon-title pulse';
    subText.innerText = 'เตรียมพร้อม ปล่อยมือจากหุ่นยนต์';
    clock.className = 'canva-digital-clock warning';
    document.getElementById('timerModeLabel').innerText = `ARENA TIMER • READY TO LAUNCH`;
  }
  else if (phase === 'match') {
    state.timer.mode = 'countdown';
    state.timer.remainingMs = (durationSeconds || 180) * 1000;
    state.settings.duration = durationSeconds || 180;

    const pillId = durationSeconds === 300 ? 'pillPhase5Min' : 'pillPhaseMatch';
    const pill = document.getElementById(pillId);
    if (pill) pill.classList.add('active');

    neonTitle.innerText = 'MATCH TIME';
    neonTitle.className = 'canva-neon-title';
    subText.innerText = `เวลาการแข่งขันหุ่นยนต์ ครั้งที่ 5 (${Math.round(state.settings.duration/60)} นาที)`;
    clock.className = 'canva-digital-clock';
    document.getElementById('timerModeLabel').innerText = `ARENA TIMER • นับถอยหลัง ${Math.round(state.settings.duration/60)} นาที`;
  } 
  else if (phase === 'countup') {
    state.timer.mode = 'countup';
    state.timer.elapsedMs = 0;
    const pill = document.getElementById('pillPhaseStopwatch');
    if (pill) pill.classList.add('active');

    neonTitle.innerText = 'STOPWATCH';
    neonTitle.className = 'canva-neon-title';
    subText.innerText = 'จับเวลาเดินหน้า (STOPWATCH ARENA)';
    clock.className = 'canva-digital-clock';
    document.getElementById('timerModeLabel').innerText = `ARENA TIMER • เดินหน้า (STOPWATCH)`;
  }

  state.timer.countedSeconds.clear();
  document.getElementById('timerBtnText').innerText = 'START';
  document.getElementById('canvaBtnText').innerText = 'START';
  document.getElementById('timerStateText').innerText = 'READY TO LAUNCH';
  updateTimerDisplay();

  // Broadcast Phase Change to Projector Screen
  arenaSync.emit('TIMER_PHASE', {
    phase: state.timer.phase,
    mode: state.timer.mode,
    remainingMs: state.timer.remainingMs
  });
}

// Preset shortcuts
function setTimerPreset(seconds) {
  setTimerPhase('match', seconds);
}

function setCountupMode() {
  setTimerPhase('countup', 0);
}

// ================= SCORING SYSTEM =================

// Toggle Individual Box
function toggleBox(teamKey, tier, slot) {
  const current = state.teams[teamKey].boxes[tier][slot];
  state.teams[teamKey].boxes[tier][slot] = !current;
  
  sound.boxLatch(!current);
  updateBoxSlotUI(teamKey, tier, slot);
  updateScores();
}

function updateBoxSlotUI(teamKey, tier, slot) {
  const btn = document.getElementById(`${teamKey}_box_${tier}_${slot}`);
  if (!btn) return;
  const isActive = state.teams[teamKey].boxes[tier][slot];
  if (isActive) {
    btn.classList.add('active');
  } else {
    btn.classList.remove('active');
  }
}

// Set All Boxes for a Team (Quick fill 9 boxes or clear)
function setAllBoxes(teamKey, fill) {
  const tiers = ['top', 'mid', 'base'];
  const slots = ['team', 'w1', 'w2'];
  tiers.forEach(tier => {
    slots.forEach(slot => {
      state.teams[teamKey].boxes[tier][slot] = fill;
      updateBoxSlotUI(teamKey, tier, slot);
    });
  });

  if (fill) {
    sound.scoreChime();
    arenaSync.emit('AUDIO_TRIGGER', { type: 'score' });
  } else {
    sound.click();
  }
  updateScores();
}

// Toggle Egg & Flag Missions
function toggleMission(teamKey, missionType) {
  const current = state.teams[teamKey][missionType];
  state.teams[teamKey][missionType] = !current;

  const item = document.getElementById(`${teamKey}${capitalize(missionType)}Item`);
  if (item) {
    if (!current) {
      item.classList.add('active');
      sound.scoreChime();
      arenaSync.emit('AUDIO_TRIGGER', { type: 'score' });
    } else {
      item.classList.remove('active');
      sound.click();
    }
  }

  // If Flag is finished and timer is running, stamp finish time
  if (missionType === 'flag' && !current && state.teams[teamKey].finishTime === null) {
    markTeamFinish(teamKey);
  }

  updateScores();
}

// Adjust Fouls
function adjustFoul(teamKey, change) {
  state.teams[teamKey].fouls = Math.max(0, state.teams[teamKey].fouls + change);
  if (change > 0) {
    sound.foulAlert();
    arenaSync.emit('AUDIO_TRIGGER', { type: 'foul' });
  } else {
    sound.click();
  }
  updateScores();
}

// Custom direct score adjustment (+1, -1, +10, -10)
function adjustCustomScore(teamKey, delta) {
  state.teams[teamKey].customOffset += delta;
  if (delta > 0) {
    sound.scoreChime();
    arenaSync.emit('AUDIO_TRIGGER', { type: 'score' });
  } else {
    sound.click();
  }
  updateScores();
}

// Calculate and Render Scores
function updateScores() {
  let blueTotal = 0;
  let redTotal = 0;

  ['blue', 'red'].forEach(team => {
    const tData = state.teams[team];

    // Calculate Box Score (10 pts per box, max 9 boxes = 90 pts)
    let boxCount = 0;
    ['top', 'mid', 'base'].forEach(tier => {
      ['team', 'w1', 'w2'].forEach(slot => {
        if (tData.boxes[tier][slot]) boxCount++;
      });
    });
    const boxScore = boxCount * 10;
    const eggScore = tData.egg ? 10 : 0;
    const flagScore = tData.flag ? 20 : 0;
    const foulDeduction = tData.fouls * state.settings.foulPenalty;

    // Total Score
    const total = Math.max(0, boxScore + eggScore + flagScore - foulDeduction + tData.customOffset);
    tData.score = total;
    if (team === 'blue') blueTotal = total;
    else redTotal = total;

    // Update main UI
    const boxScoreEl = document.getElementById(`${team}BoxScore`);
    if (boxScoreEl) boxScoreEl.innerText = boxScore;

    const foulCountEl = document.getElementById(`${team}FoulCount`);
    if (foulCountEl) foulCountEl.innerText = tData.fouls;

    const foulDeductEl = document.getElementById(`${team}FoulDeduct`);
    if (foulDeductEl) foulDeductEl.innerText = `-${foulDeduction} คะแนน`;

    const totalEl = document.getElementById(`${team}TotalScore`);
    if (totalEl) {
      if (totalEl.innerText !== String(total)) {
        totalEl.innerText = total;
        totalEl.classList.add('bump');
        setTimeout(() => totalEl.classList.remove('bump'), 180);
      }
    }

    // UPDATE GIANT SCORE IN CANVA ARENA VIEW
    const canvaGiantScoreEl = document.getElementById(team === 'blue' ? 'canvaBlueScore' : 'canvaRedScore');
    if (canvaGiantScoreEl) {
      if (canvaGiantScoreEl.innerText !== String(total)) {
        canvaGiantScoreEl.innerText = total;
        canvaGiantScoreEl.classList.add('bump');
        setTimeout(() => canvaGiantScoreEl.classList.remove('bump'), 220);
      }
    }
    // Check for 120 PERFECT SCORE: STOP TIMER IMMEDIATELY & PLAY CHEER APPLAUSE!
    if (total >= 120) {
      if (!tData.hasReached120) {
        tData.hasReached120 = true;
        handlePerfect120Reached(team);
      }
    } else {
      tData.hasReached120 = false;
    }
  });

  updateLeaderDisplay();

  // Persist latest scores in state
  state.teams.blue.score = blueTotal;
  state.teams.red.score = redTotal;
  saveToStorage();

  // BROADCAST REALTIME SCORE TO PROJECTOR DISPLAY WINDOW
  arenaSync.emit('SCORE_UPDATE', {
    blue: blueTotal,
    red: redTotal
  });

  // Direct memory call to any registered projector window (zero latency)
  if (window.__activeProjectorDisplays && Array.isArray(window.__activeProjectorDisplays)) {
    window.__activeProjectorDisplays.forEach(win => {
      try {
        if (win && !win.closed && typeof win.updateArenaScoreFromController === 'function') {
          win.updateArenaScoreFromController(blueTotal, redTotal);
        }
      } catch (e) {}
    });
  }

  // Direct child window postMessage & direct function call fallback
  if (displayWindowRef && !displayWindowRef.closed) {
    try {
      if (typeof displayWindowRef.updateArenaScoreFromController === 'function') {
        displayWindowRef.updateArenaScoreFromController(blueTotal, redTotal);
      }
      displayWindowRef.postMessage({
        channelName: 'robot_arena_sync_channel',
        type: 'SCORE_UPDATE',
        payload: { blue: blueTotal, red: redTotal }
      }, '*');
    } catch (e) {}
  }
}

// Continuous Realtime Score Push Heartbeat (every 250ms)
setInterval(() => {
  const blueScoreEl = document.getElementById('blueTotalScore');
  const redScoreEl = document.getElementById('redTotalScore');
  if (!blueScoreEl || !redScoreEl) return;

  const b = parseInt(blueScoreEl.innerText, 10) || 0;
  const r = parseInt(redScoreEl.innerText, 10) || 0;

  // 1. Update Atomic LocalStorage keys
  try {
    localStorage.setItem('robot_live_blue_score', String(b));
    localStorage.setItem('robot_live_red_score', String(r));
  } catch (e) {}

  // 2. Push directly to display window reference
  if (displayWindowRef && !displayWindowRef.closed) {
    try {
      if (typeof displayWindowRef.updateArenaScoreFromController === 'function') {
        displayWindowRef.updateArenaScoreFromController(b, r);
      }
    } catch (e) {}
  }

  // 3. Push to all registered projector windows
  if (window.__activeProjectorDisplays && Array.isArray(window.__activeProjectorDisplays)) {
    window.__activeProjectorDisplays.forEach(win => {
      try {
        if (win && !win.closed && typeof win.updateArenaScoreFromController === 'function') {
          win.updateArenaScoreFromController(b, r);
        }
      } catch (e) {}
    });
  }
}, 250);

// ================= 120 PERFECT SCORE CELEBRATION =================
function handlePerfect120Reached(teamKey) {
  // 1. STOP TIMER IMMEDIATELY
  if (state.timer.isRunning) {
    pauseTimer();
  }

  // 2. Mark finish time if not already marked
  if (state.teams[teamKey].finishTime === null) {
    markTeamFinish(teamKey);
  }

  // 3. Update status tag to PERFECT 120
  const statusTag = document.getElementById(`${teamKey}StatusTag`);
  const canvaStatus = document.getElementById(teamKey === 'blue' ? 'canvaBlueStatus' : 'canvaRedStatus');
  if (statusTag) {
    statusTag.classList.add('finished');
    statusTag.innerText = `🌟 PERFECT 120 PTS! (${state.teams[teamKey].finishTime || ''})`;
  }
  if (canvaStatus) {
    canvaStatus.classList.add('finished');
    canvaStatus.innerText = `🌟 120 คะแนนเต็ม! (${state.teams[teamKey].finishTime || ''})`;
  }

  // 4. Play Crowd Applause & Cheering + Fanfare
  sound.cheerAndApplause();

  // 5. Broadcast to Projector Screen
  arenaSync.emit('AUDIO_TRIGGER', { type: 'cheer_applause', team: teamKey });
  arenaSync.emit('PERFECT_120_EVENT', {
    team: teamKey,
    time: state.teams[teamKey].finishTime,
    teamName: state.teams[teamKey].name
  });

  // 6. Launch Confetti celebration particles on screen
  launchConfetti();
}

// Confetti Particle Explosion
function launchConfetti() {
  const colors = ['#ffd700', '#00d2ff', '#ff2a5f', '#00ff88', '#ffffff', '#ff00aa'];
  const confettiCount = 80;

  for (let i = 0; i < confettiCount; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-particle';
    el.style.left = `${Math.random() * 100}vw`;
    el.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    el.style.animationDuration = `${2 + Math.random() * 2.5}s`;
    el.style.animationDelay = `${Math.random() * 0.8}s`;
    el.style.width = `${8 + Math.random() * 10}px`;
    el.style.height = `${8 + Math.random() * 14}px`;
    document.body.appendChild(el);

    setTimeout(() => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }, 4500);
  }
}

// Update Leaderboard & Point Difference
function updateLeaderboard() {
  const blueScore = parseInt(document.getElementById('blueTotalScore').innerText) || 0;
  const redScore = parseInt(document.getElementById('redTotalScore').innerText) || 0;
  const statusEl = document.getElementById('leaderStatusText');
  const barBlue = document.getElementById('diffBarBlue');
  const barRed = document.getElementById('diffBarRed');

  if (blueScore === redScore) {
    statusEl.innerHTML = `คะแนนเสมอกัน (${blueScore} - ${redScore})`;
    statusEl.className = 'leader-result';
    barBlue.style.width = '50%';
    barRed.style.width = '50%';
  } else if (blueScore > redScore) {
    const diff = blueScore - redScore;
    statusEl.innerHTML = `<span style="color:var(--cyber-blue)">น้ำเงินนำ +${diff} คะแนน</span> (${blueScore} - ${redScore})`;
    const pct = Math.min(85, Math.max(15, (blueScore / (blueScore + redScore)) * 100));
    barBlue.style.width = `${pct}%`;
    barRed.style.width = `${100 - pct}%`;
  } else {
    const diff = redScore - blueScore;
    statusEl.innerHTML = `<span style="color:var(--cyber-red)">แดงนำ +${diff} คะแนน</span> (${redScore} - ${blueScore})`;
    const pct = Math.min(85, Math.max(15, (blueScore / (blueScore + redScore)) * 100));
    barBlue.style.width = `${pct}%`;
    barRed.style.width = `${100 - pct}%`;
  }
}

// updateScores() calls this name; it refreshes the leader banner / diff bar
function updateLeaderDisplay() {
  updateLeaderboard();
}

// Mark Team Finish Time
function markTeamFinish(teamKey) {
  const currentRecorded = state.teams[teamKey].finishTime;
  const badge = document.getElementById(`${teamKey}FinishTime`);
  const btn = document.getElementById(`${teamKey}FinishBtn`);
  const statusTag = document.getElementById(`${teamKey}StatusTag`);
  const canvaStatus = document.getElementById(teamKey === 'blue' ? 'canvaBlueStatus' : 'canvaRedStatus');

  if (!currentRecorded) {
    const timeFormatted = getCurrentTimeFormatted();
    state.teams[teamKey].finishTime = timeFormatted;
    badge.innerText = `เวลา: ${timeFormatted}`;
    btn.classList.add('finished');
    statusTag.classList.add('finished');
    statusTag.innerText = `FINISHED (${timeFormatted})`;

    if (canvaStatus) {
      canvaStatus.classList.add('finished');
      canvaStatus.innerText = `จบเวลา: ${timeFormatted}`;
    }
    sound.victory();
    arenaSync.emit('AUDIO_TRIGGER', { type: 'victory' });
  } else {
    state.teams[teamKey].finishTime = null;
    badge.innerText = `เวลา: ยังไม่จบ`;
    btn.classList.remove('finished');
    statusTag.classList.remove('finished');
    statusTag.innerText = `READY`;

    if (canvaStatus) {
      canvaStatus.classList.remove('finished');
      canvaStatus.innerText = `READY`;
    }
    sound.click();
  }

  broadcastTeamUpdate();
}

function getCurrentTimeFormatted() {
  if (state.timer.mode === 'countdown') {
    const currentBase = state.timer.phase === 'setup' ? (state.settings.setupDuration || 60) : state.settings.duration;
    const totalElapsedSec = (currentBase * 1000 - state.timer.remainingMs) / 1000;
    const m = Math.floor(Math.max(0, totalElapsedSec) / 60);
    const s = Math.floor(Math.max(0, totalElapsedSec) % 60);
    const ms = Math.floor((Math.max(0, totalElapsedSec) % 1) * 100);
    return `${pad(m)}:${pad(s)}.${pad(ms)}`;
  } else {
    const m = Math.floor(state.timer.elapsedMs / 60000);
    const s = Math.floor((state.timer.elapsedMs % 60000) / 1000);
    const ms = Math.floor((state.timer.elapsedMs % 1000) / 10);
    return `${pad(m)}:${pad(s)}.${pad(ms)}`;
  }
}

// ================= ARENA TIMER & EXCITING SOUND BEAT =================
function toggleTimer() {
  sound.click();
  if (state.timer.isRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  if (state.timer.remainingMs <= 0 && state.timer.mode === 'countdown') {
    const defaultDur = state.timer.phase === 'setup' ? (state.settings.setupDuration || 60) : state.settings.duration;
    state.timer.remainingMs = defaultDur * 1000;
    state.timer.countedSeconds.clear();
    state.timer.isUrgentBeatStarted = false;
  }

  state.timer.isRunning = true;
  state.timer.lastTick = performance.now();
  state.timer.intervalId = requestAnimationFrame(timerTick);

  // DUAL-TRACK SELECTION: DIFFERENT TRACK FOR SET UP VS MATCH
  if (state.timer.phase === 'setup') {
    sound.startSetupChime();
    arenaSync.emit('AUDIO_TRIGGER', { type: 'setup_chime' });
    if (state.settings.bgmEnabled) {
      sound.startArenaBeat('setup', false);
      updateBeatWaveVisual(true, 'SET UP CALIBRATION GROOVE (112 BPM)');
      arenaSync.emit('AUDIO_TRIGGER', { type: 'beat_start', phase: 'setup', isUrgent: false });
    }
  } else {
    sound.startWhistle();
    arenaSync.emit('AUDIO_TRIGGER', { type: 'whistle' });
    if (state.settings.bgmEnabled) {
      sound.startArenaBeat('match', false);
      updateBeatWaveVisual(true, 'MATCH ARENA BATTLE BEAT (128 BPM)');
      arenaSync.emit('AUDIO_TRIGGER', { type: 'beat_start', phase: 'match', isUrgent: false });
    }
  }

  // Synchronize UI
  const btn = document.getElementById('btnTimerStartPause');
  const canvaBtn = document.getElementById('canvaDockStart');
  btn.classList.add('running');
  canvaBtn.classList.add('running');
  document.getElementById('timerBtnText').innerText = 'PAUSE';
  document.getElementById('canvaBtnText').innerText = 'PAUSE';
  document.getElementById('timerPlayIcon').setAttribute('data-lucide', 'pause');
  document.getElementById('canvaPlayIcon').setAttribute('data-lucide', 'pause');
  document.getElementById('timerStateText').innerText = 'MATCH RUNNING';
  document.getElementById('systemStatus').innerText = 'LIVE ARENA';
  lucide.createIcons();

  // Broadcast timer start to projector screen
  arenaSync.emit('TIMER_START');
}

function pauseTimer() {
  state.timer.isRunning = false;
  if (state.timer.intervalId) {
    cancelAnimationFrame(state.timer.intervalId);
    state.timer.intervalId = null;
  }

  // Stop exciting beat
  sound.stopArenaBeat();
  updateBeatWaveVisual(false);
  arenaSync.emit('AUDIO_TRIGGER', { type: 'beat_stop' });

  const btn = document.getElementById('btnTimerStartPause');
  const canvaBtn = document.getElementById('canvaDockStart');
  btn.classList.remove('running');
  canvaBtn.classList.remove('running');
  document.getElementById('timerBtnText').innerText = 'RESUME';
  document.getElementById('canvaBtnText').innerText = 'RESUME';
  document.getElementById('timerPlayIcon').setAttribute('data-lucide', 'play');
  document.getElementById('canvaPlayIcon').setAttribute('data-lucide', 'play');
  document.getElementById('timerStateText').innerText = 'MATCH PAUSED';
  document.getElementById('systemStatus').innerText = 'PAUSED';
  lucide.createIcons();

  // Broadcast timer pause to projector screen
  arenaSync.emit('TIMER_PAUSE');
}

let lastDriftSyncTime = 0;

function timerTick(currentTimestamp) {
  if (!state.timer.isRunning) return;

  const delta = currentTimestamp - (state.timer.lastTick || currentTimestamp);
  state.timer.lastTick = currentTimestamp;

  if (state.timer.mode === 'countdown') {
    state.timer.remainingMs = Math.max(0, state.timer.remainingMs - delta);
    const secLeft = Math.ceil(state.timer.remainingMs / 1000);

    // Speed up beat tempo in final 30 seconds of match
    if (state.timer.phase === 'match' && secLeft <= 30 && secLeft > 0 && !state.timer.isUrgentBeatStarted && state.settings.bgmEnabled) {
      state.timer.isUrgentBeatStarted = true;
      sound.startArenaBeat('match', true);
      updateBeatWaveVisual(true, 'URGENT TENSION SURGE (138 BPM)');
      arenaSync.emit('AUDIO_TRIGGER', { type: 'beat_start', phase: 'match', isUrgent: true });
    }

    // Audio Cues at 5, 4, 3, 2, 1
    if (secLeft <= 5 && secLeft > 0 && !state.timer.countedSeconds.has(secLeft)) {
      state.timer.countedSeconds.add(secLeft);
      sound.countdownBeep(secLeft === 1);
      arenaSync.emit('AUDIO_TRIGGER', { type: 'beep', isFinal: secLeft === 1 });
    }

    if (state.timer.remainingMs <= 0) {
      // Time is UP!
      state.timer.remainingMs = 0;
      updateTimerDisplay();
      pauseTimer();
      document.getElementById('timerStateText').innerText = 'TIME EXPIRED';
      document.getElementById('systemStatus').innerText = 'TIME OUT';

      const neonTitle = document.getElementById('canvaNeonTitle');
      if (neonTitle) {
        neonTitle.innerText = 'TIME UP';
        neonTitle.className = 'canva-neon-title pulse';
      }

      sound.buzzer();
      arenaSync.emit('AUDIO_TRIGGER', { type: 'buzzer' });
      return;
    }
  } else {
    // Count up
    state.timer.elapsedMs += delta;
  }

  // Periodic drift correction sync every 1 second
  if (currentTimestamp - lastDriftSyncTime > 1000) {
    lastDriftSyncTime = currentTimestamp;
    arenaSync.emit('TIMER_DRIFT_SYNC', {
      remainingMs: state.timer.remainingMs,
      elapsedMs: state.timer.elapsedMs
    });
  }

  updateTimerDisplay();
  state.timer.intervalId = requestAnimationFrame(timerTick);
}

function updateTimerDisplay() {
  const clockEl = document.getElementById('mainClock');
  const canvaClockEl = document.getElementById('canvaClock');

  let msToShow = state.timer.mode === 'countdown' ? state.timer.remainingMs : state.timer.elapsedMs;

  const minutes = Math.floor(msToShow / 60000);
  const seconds = Math.floor((msToShow % 60000) / 1000);
  const millis = Math.floor((msToShow % 1000) / 10);

  // Main HUD clock
  document.getElementById('timerMinutes').innerText = pad(minutes);
  document.getElementById('timerSeconds').innerText = pad(seconds);
  document.getElementById('timerMillis').innerText = `.${pad(millis)}`;

  // Canva view clock
  document.getElementById('canvaMin').innerText = pad(minutes);
  document.getElementById('canvaSec').innerText = pad(seconds);
  document.getElementById('canvaMs').innerText = `.${pad(millis)}`;

  if (state.timer.mode === 'countdown' && msToShow <= 10000 && msToShow > 0) {
    clockEl.classList.add('warning');
    if (canvaClockEl) canvaClockEl.classList.add('warning');
  } else {
    clockEl.classList.remove('warning');
    if (canvaClockEl) canvaClockEl.classList.remove('warning');
  }
}

function resetTimerPrompt() {
  sound.click();
  showConfirmDialog(
    'รีเซ็ตเวลาการแข่งขัน',
    'คุณต้องการรีเซ็ตเวลากลับไปเป็นค่าเริ่มต้นใช่หรือไม่?',
    () => {
      pauseTimer();
      if (state.timer.mode === 'countdown') {
        const defaultDur = state.timer.phase === 'setup' ? (state.settings.setupDuration || 60) : state.settings.duration;
        state.timer.remainingMs = defaultDur * 1000;
        state.timer.countedSeconds.clear();
        state.timer.isUrgentBeatStarted = false;
      } else {
        state.timer.elapsedMs = 0;
      }
      document.getElementById('timerBtnText').innerText = 'START';
      document.getElementById('canvaBtnText').innerText = 'START';
      document.getElementById('timerStateText').innerText = 'TIMER RESET';
      
      const neonTitle = document.getElementById('canvaNeonTitle');
      if (neonTitle) {
        if (state.timer.phase === 'setup') neonTitle.innerText = 'SET UP';
        else if (state.timer.phase === 'ready') neonTitle.innerText = 'READY';
        else neonTitle.innerText = 'MATCH TIME';
      }

      updateTimerDisplay();

      // Emit reset to projector screen
      arenaSync.emit('TIMER_RESET', {
        remainingMs: state.timer.remainingMs,
        elapsedMs: state.timer.elapsedMs,
        phase: state.timer.phase
      });
    }
  );
}

// ================= RESET ALL SCORES =================
function resetAllScoresPrompt() {
  sound.click();
  showConfirmDialog(
    'รีเซ็ตข้อมูลทั้งหมดในสนาม (ครั้งที่ 5)',
    'คะแนนของทั้งทีมสีแดงและน้ำเงินจะถูกรีเซ็ตเป็น 0 รวมถึงการจัดวางกล่องและภารกิจ ต้องการดำเนินการต่อหรือไม่?',
    () => {
      ['blue', 'red'].forEach(team => {
        const t = state.teams[team];
        ['top', 'mid', 'base'].forEach(tier => {
          ['team', 'w1', 'w2'].forEach(slot => {
            t.boxes[tier][slot] = false;
            updateBoxSlotUI(team, tier, slot);
          });
        });
        t.egg = false;
        t.flag = false;
        t.fouls = 0;
        t.customOffset = 0;
        t.finishTime = null;

        // UI Reset
        const eggItem = document.getElementById(`${team}EggItem`);
        if (eggItem) eggItem.classList.remove('active');
        const flagItem = document.getElementById(`${team}FlagItem`);
        if (flagItem) flagItem.classList.remove('active');
        const badge = document.getElementById(`${team}FinishTime`);
        if (badge) badge.innerText = 'เวลา: ยังไม่จบ';
        const finishBtn = document.getElementById(`${team}FinishBtn`);
        if (finishBtn) finishBtn.classList.remove('finished');
        const statusTag = document.getElementById(`${team}StatusTag`);
        if (statusTag) {
          statusTag.classList.remove('finished');
          statusTag.innerText = 'READY';
        }
        const canvaStatus = document.getElementById(team === 'blue' ? 'canvaBlueStatus' : 'canvaRedStatus');
        if (canvaStatus) {
          canvaStatus.classList.remove('finished');
          canvaStatus.innerText = 'READY';
        }
      });

      updateScores();
      broadcastTeamUpdate();
      sound.boxLatch(false);
    }
  );
}

// ================= SWAP TEAMS (BLUE <-> RED) =================
function swapTeams() {
  sound.click();
  const blueName = document.getElementById('blueTeamName').value;
  const blueSchool = document.getElementById('blueSchoolName').value;
  const redName = document.getElementById('redTeamName').value;
  const redSchool = document.getElementById('redSchoolName').value;

  document.getElementById('blueTeamName').value = redName;
  document.getElementById('blueSchoolName').value = redSchool;
  document.getElementById('redTeamName').value = blueName;
  document.getElementById('redSchoolName').value = blueSchool;

  saveToStorage();
  syncCanvaTeamDetails();
  broadcastTeamUpdate();
}

// ================= MATCH HISTORY & EXPORT =================
function saveMatchToHistory() {
  sound.click();
  const blueName = document.getElementById('blueTeamName').value || 'BLUE';
  const redName = document.getElementById('redTeamName').value || 'RED';
  const blueScore = parseInt(document.getElementById('blueTotalScore').innerText) || 0;
  const redScore = parseInt(document.getElementById('redTotalScore').innerText) || 0;
  const round = document.getElementById('roundTag').innerText;
  const category = document.getElementById('categoryTag').innerText;

  let outcome = 'DRAW';
  if (blueScore > redScore) outcome = `${blueName} ชนะ`;
  else if (redScore > blueScore) outcome = `${redName} ชนะ`;

  const record = {
    id: Date.now(),
    dateStr: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    roundInfo: `${category} - ${round}`,
    blueTeam: blueName,
    blueScore: blueScore,
    blueTime: state.teams.blue.finishTime || '-',
    outcome: outcome,
    redScore: redScore,
    redTime: state.teams.red.finishTime || '-',
    redTeam: redName
  };

  state.history.unshift(record);
  saveToStorage();
  openHistoryModal();
}

function openHistoryModal() {
  renderHistoryTable();
  openModal('modalHistory');
}

function renderHistoryTable() {
  const tbody = document.getElementById('historyTableBody');
  if (!tbody) return;

  if (state.history.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:var(--text-dim); padding:20px;">ยังไม่มีประวัติการบันทึกผลการแข่งขัน</td></tr>`;
    return;
  }

  tbody.innerHTML = state.history.map(item => `
    <tr>
      <td>${item.dateStr}</td>
      <td><strong>${item.roundInfo}</strong></td>
      <td class="winner-blue">${item.blueTeam}</td>
      <td style="font-family:var(--font-scifi); font-size:1.1rem; font-weight:700;">${item.blueScore}</td>
      <td><span class="match-round-tag">${item.outcome}</span></td>
      <td style="font-family:var(--font-scifi); font-size:1.1rem; font-weight:700;">${item.redScore}</td>
      <td class="winner-red">${item.redTeam}</td>
    </tr>
  `).join('');
}

function exportHistoryCSV() {
  sound.click();
  if (state.history.length === 0) {
    alert('ไม่มีข้อมูลประวัติสำหรับการส่งออก');
    return;
  }

  let csvContent = '\uFEFF'; // BOM for Thai Excel UTF-8 support
  csvContent += 'ลำดับ,เวลาบันทึก,สาย/รอบการแข่งขัน,ทีมสีน้ำเงิน,คะแนนน้ำเงิน,เวลาน้ำเงิน,ผลการแข่งขัน,คะแนนแดง,เวลาแดง,ทีมสีแดง\n';

  state.history.forEach((h, idx) => {
    csvContent += `"${idx + 1}","${h.dateStr}","${h.roundInfo}","${h.blueTeam}","${h.blueScore}","${h.blueTime}","${h.outcome}","${h.redScore}","${h.redTime}","${h.redTeam}"\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `ผลการแข่งขันหุ่นยนต์ปักธงชัย_ครั้งที่5_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Export scores to a real Excel file (.xlsx) — works offline
//   Sheet 1: all saved match results (history)   Sheet 2: the match currently on screen
function exportScoresExcel() {
  sound.click();
  const penalty = state.settings.foulPenalty;
  const val = (id, fallback) => {
    const el = document.getElementById(id);
    return el && el.value ? el.value : fallback;
  };
  const now = new Date();

  // --- Sheet 1: history ---
  const historyRows = state.history.map((h, i) => [
    i + 1, h.dateStr, h.roundInfo, h.blueTeam, Number(h.blueScore) || 0, h.blueTime,
    h.outcome, Number(h.redScore) || 0, h.redTime, h.redTeam
  ]);
  if (historyRows.length === 0) {
    historyRows.push(['', 'ยังไม่มีผลที่บันทึก (กด "บันทึกผลรอบนี้" ก่อน)', '', '', '', '', '', '', '', '']);
  }

  // --- Sheet 2: current match breakdown ---
  const teamRow = (key, label, style) => {
    const t = state.teams[key];
    let boxCount = 0;
    ['top', 'mid', 'base'].forEach(tier => ['team', 'w1', 'w2'].forEach(slot => { if (t.boxes[tier][slot]) boxCount++; }));
    const boxScore = boxCount * 10;
    const eggScore = t.egg ? 10 : 0;
    const flagScore = t.flag ? 20 : 0;
    const foulDeduct = t.fouls * penalty;
    const total = Math.max(0, boxScore + eggScore + flagScore - foulDeduct + t.customOffset);
    return [
      { v: label, s: style },
      val(`${key}TeamName`, t.name), val(`${key}SchoolName`, t.school),
      boxCount, boxScore, eggScore, flagScore, t.fouls, -foulDeduct, t.customOffset,
      { v: total, s: style }, t.finishTime || '-'
    ];
  };
  const round = (document.getElementById('roundTag') || {}).innerText || '';
  const category = (document.getElementById('categoryTag') || {}).innerText || '';
  const currentRows = [
    teamRow('blue', 'น้ำเงิน', 5),
    teamRow('red', 'แดง', 6),
    [],
    [{ v: 'สาย/รอบ', s: 4 }, { v: `${category} - ${round}`, s: 0 }],
    [{ v: 'ส่งออกเมื่อ', s: 4 }, { v: now.toLocaleString('th-TH'), s: 0 }]
  ];

  const blob = XlsxLite.build([
    {
      name: 'ผลการแข่งขัน',
      header: ['ลำดับ', 'เวลาบันทึก', 'สาย/รอบการแข่งขัน', 'ทีมสีน้ำเงิน', 'คะแนนน้ำเงิน', 'เวลาน้ำเงิน',
               'ผลการแข่งขัน', 'คะแนนแดง', 'เวลาแดง', 'ทีมสีแดง'],
      rows: historyRows,
      widths: [8, 14, 30, 34, 14, 14, 26, 14, 14, 34],
      colStyles: [2, 2, 3, 3, 2, 2, 2, 2, 2, 3]
    },
    {
      name: 'รอบปัจจุบัน',
      header: ['ฝั่ง', 'ชื่อทีม', 'โรงเรียน / สังกัด', 'กล่องที่วาง (กล่อง)', 'คะแนนกล่อง', 'ภารกิจ 2 ไข่ทองคำ',
               'ภารกิจ 3 ปักธง', 'ฟาวล์ (ครั้ง)', 'คะแนนหักฟาวล์', 'ปรับคะแนนด่วน', 'คะแนนรวม', 'เวลาจบ'],
      rows: currentRows,
      widths: [12, 34, 30, 18, 14, 18, 16, 14, 16, 16, 14, 14],
      colStyles: [2, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2]
    }
  ]);

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `คะแนนการแข่งขันหุ่นยนต์ปักธงชัย_ครั้งที่5_${now.toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function clearHistoryPrompt() {
  showConfirmDialog(
    'ล้างประวัติการแข่งขันทั้งหมด',
    'คุณต้องการลบประวัติการแข่งขันทั้งหมดออกจากเครื่องหรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้',
    () => {
      state.history = [];
      saveToStorage();
      renderHistoryTable();
    }
  );
}

// ================= SETTINGS MODAL =================
function saveSettings() {
  sound.click();
  const dur = parseInt(document.getElementById('cfgMatchDuration').value) || 180;
  const setupDur = parseInt(document.getElementById('cfgSetupDuration').value) || 60;
  const foul = parseInt(document.getElementById('cfgFoulPenalty').value) || 5;
  const soundPref = document.querySelector('input[name="cfgSound"]:checked').value;

  state.settings.duration = dur;
  state.settings.setupDuration = setupDur;
  state.settings.foulPenalty = foul;

  if (soundPref === 'all') {
    state.settings.soundEnabled = true;
    state.settings.bgmEnabled = true;
  } else if (soundPref === 'sfx') {
    state.settings.soundEnabled = true;
    state.settings.bgmEnabled = false;
  } else {
    state.settings.soundEnabled = false;
    state.settings.bgmEnabled = false;
  }

  sound.enabled = state.settings.soundEnabled;
  sound.bgmEnabled = state.settings.bgmEnabled;

  updateSoundIcon();
  updateBeatIcon();
  saveToStorage();
  closeModal('modalSettings');
  updateScores();
  broadcastFullState();
}

// ================= MODAL & CONFIRM UTILS =================
function openModal(modalId) {
  sound.click();
  const m = document.getElementById(modalId);
  if (m) m.classList.add('show');
}

function closeModal(modalId) {
  sound.click();
  const m = document.getElementById(modalId);
  if (m) m.classList.remove('show');
}

function showConfirmDialog(title, message, onConfirm) {
  const modal = document.getElementById('customConfirmModal');
  const titleEl = document.getElementById('confirmTitle');
  const msgEl = document.getElementById('confirmMessage');
  const btnOk = document.getElementById('confirmBtnOk');
  const btnCancel = document.getElementById('confirmBtnCancel');

  titleEl.innerText = title;
  msgEl.innerText = message;
  modal.classList.add('show');

  const cleanUp = () => {
    modal.classList.remove('show');
    btnOk.onclick = null;
    btnCancel.onclick = null;
  };

  btnOk.onclick = () => {
    cleanUp();
    if (typeof onConfirm === 'function') onConfirm();
  };

  btnCancel.onclick = () => {
    cleanUp();
    sound.click();
  };
}

// ================= FULLSCREEN & AUDIO CONTROLS =================
function toggleFullscreen() {
  sound.click();
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => console.log(err));
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

function toggleSoundMaster() {
  const enabled = sound.toggle();
  state.settings.soundEnabled = enabled;
  updateSoundIcon();
  if (enabled) sound.click();
}

function toggleArenaBeatMaster() {
  const enabled = sound.toggleBgm();
  state.settings.bgmEnabled = enabled;
  updateBeatIcon();
  if (enabled) {
    sound.click();
    if (state.timer.isRunning) {
      sound.startArenaBeat(state.timer.phase, false);
      updateBeatWaveVisual(true, state.timer.phase === 'setup' ? 'SET UP CALIBRATION (112 BPM)' : 'MATCH BATTLE BEAT (128 BPM)');
      arenaSync.emit('AUDIO_TRIGGER', { type: 'beat_start', phase: state.timer.phase, isUrgent: false });
    }
  } else {
    sound.stopArenaBeat();
    updateBeatWaveVisual(false);
    arenaSync.emit('AUDIO_TRIGGER', { type: 'beat_stop' });
  }
  saveToStorage();
}

function updateBeatWaveVisual(isPlaying, labelText) {
  const wave = document.getElementById('beatWaveIndicator');
  if (wave) {
    wave.style.display = isPlaying ? 'flex' : 'none';
    if (labelText) {
      const textEl = wave.querySelector('.beat-text');
      if (textEl) textEl.innerText = labelText;
    }
  }
}

function updateSoundIcon() {
  const icons = [document.getElementById('soundIcon'), document.getElementById('canvaSoundIcon')];
  icons.forEach(icon => {
    if (icon) {
      icon.setAttribute('data-lucide', sound.enabled ? 'volume-2' : 'volume-x');
    }
  });
  lucide.createIcons();
}

// Beat (Arena Tension music) button state in header + CANVA view
function updateBeatIcon() {
  const on = !!sound.bgmEnabled;
  const btn = document.getElementById('btnBeatToggle');
  if (btn) btn.classList.toggle('active', on);
  const canvaBtn = document.getElementById('canvaBeatToggle');
  if (canvaBtn) canvaBtn.classList.toggle('active', on);
  const label = document.getElementById('canvaBeatLabel');
  if (label) label.innerText = on ? 'ซาวน์แข่ง: เปิด' : 'ซาวน์แข่ง: ปิด';
}

// ================= STEP (ขั้น) HOTKEYS =================
// One press = one box (10 pts). Boxes are built from the bottom up:
// base (team, w1, w2) -> mid (team, w1, w2) -> top (team, w1, w2)
const BOX_BUILD_ORDER = [];
['base', 'mid', 'top'].forEach(tier => {
  ['team', 'w1', 'w2'].forEach(slot => BOX_BUILD_ORDER.push([tier, slot]));
});

// Fill the next empty box in build order
function addTier(teamKey) {
  const boxes = state.teams[teamKey].boxes;
  const next = BOX_BUILD_ORDER.find(([tier, slot]) => !boxes[tier][slot]);
  if (!next) { sound.click(); return; } // all 9 boxes already filled
  const [tier, slot] = next;
  boxes[tier][slot] = true;
  updateBoxSlotUI(teamKey, tier, slot);
  sound.scoreChime();
  arenaSync.emit('AUDIO_TRIGGER', { type: 'score' });
  updateScores();
}

// Clear the last filled box in build order (top of the stack first)
function removeTier(teamKey) {
  const boxes = state.teams[teamKey].boxes;
  const last = [...BOX_BUILD_ORDER].reverse().find(([tier, slot]) => boxes[tier][slot]);
  if (!last) { sound.click(); return; } // nothing to remove
  const [tier, slot] = last;
  boxes[tier][slot] = false;
  updateBoxSlotUI(teamKey, tier, slot);
  sound.click();
  updateScores();
}

// ================= GLOBAL KEYBOARD SHORTCUTS =================
// Uses e.code (physical key), so it works with Thai or English keyboard layout.
//   SPACE start/pause   R reset time   M mute   B beat   C CANVA view
//   Q/W  Blue +box/-box      O/P  Red +box/-box
//   A/S  Blue mission 2 (egg) / mission 3 (flag)
//   L/;  Red  mission 2 (egg) / mission 3 (flag)
const HOTKEY_CODES = new Set(['Space', 'KeyR', 'KeyM', 'KeyB', 'KeyC', 'KeyQ', 'KeyW', 'KeyO', 'KeyP',
                              'KeyA', 'KeyS', 'Semicolon', 'KeyL', 'Escape']);

// Returns true when the key was handled (caller should preventDefault)
function handleHotkey(code) {
  // 1) Confirm dialog open: R / Enter = confirm, Esc = cancel, everything else is swallowed
  const confirmModal = document.getElementById('customConfirmModal');
  if (confirmModal && confirmModal.classList.contains('show')) {
    if (code === 'KeyR' || code === 'Enter' || code === 'NumpadEnter') {
      document.getElementById('confirmBtnOk').click();
      return true;
    }
    if (code === 'Escape') {
      document.getElementById('confirmBtnCancel').click();
      return true;
    }
    return HOTKEY_CODES.has(code);
  }

  // 2) Settings / history modal open: only Esc closes it
  const openedModal = document.querySelector('.hud-modal.show');
  if (openedModal) {
    if (code === 'Escape') { closeModal(openedModal.id); return true; }
    return HOTKEY_CODES.has(code);
  }

  // 3) Normal operation
  switch (code) {
    case 'Space': toggleTimer(); return true;
    case 'KeyR': resetTimerPrompt(); return true;
    case 'KeyM': toggleSoundMaster(); return true;
    case 'KeyB': toggleArenaBeatMaster(); return true;
    case 'KeyC': toggleCanvaView(); return true;
    case 'KeyQ': addTier('blue'); return true;
    case 'KeyW': removeTier('blue'); return true;
    case 'KeyO': addTier('red'); return true;
    case 'KeyP': removeTier('red'); return true;
    case 'KeyA': toggleMission('blue', 'egg'); return true;
    case 'KeyS': toggleMission('blue', 'flag'); return true;
    case 'KeyL': toggleMission('red', 'egg'); return true;
    case 'Semicolon': toggleMission('red', 'flag'); return true;
    case 'Escape': {
      const canvaView = document.getElementById('canvaTimerView');
      if (canvaView && canvaView.classList.contains('active')) {
        closeCanvaView();
        return true;
      }
      return false;
    }
    default: return false;
  }
}

function isTypingTarget(el) {
  return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
}

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // Let browser shortcuts (Ctrl+R, Ctrl+S, F5 ...) work normally
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // While editing a name/title: only Esc (or Enter in a text box) gives focus back to hotkeys
    if (isTypingTarget(e.target)) {
      if (e.code === 'Escape' || (e.code === 'Enter' && e.target.tagName === 'INPUT')) {
        e.target.blur();
      }
      return;
    }

    // Holding a key down must not repeat start/pause/reset/tier actions
    if (e.repeat) {
      if (HOTKEY_CODES.has(e.code)) e.preventDefault();
      return;
    }

    if (handleHotkey(e.code)) {
      e.preventDefault();
      // A focused button would otherwise also "click" itself on Space/Enter
      const active = document.activeElement;
      if (active && active !== document.body && ['BUTTON', 'A'].includes(active.tagName)) {
        active.blur();
      }
    }
  });

  // Stop Space from clicking a focused button on key release (double toggle)
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && !isTypingTarget(e.target)) e.preventDefault();
  });

  // Top header buttons
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  };
  bind('btnSoundToggle', () => toggleSoundMaster());
  bind('btnHistory', () => openHistoryModal());
  bind('btnSettings', () => openModal('modalSettings'));
  bind('btnFullscreen', () => toggleFullscreen());
}

// Helper: pad number with leading 0
function pad(num) {
  return num < 10 ? '0' + num : num;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
