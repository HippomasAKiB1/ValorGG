/**
 * ═══════════════════════════════════════════════════════════
 *  VCT BROADCAST HUD  —  server.js
 *
 *  Express + WebSocket server.
 *  - GET  /           → Admin panel (admin.html)
 *  - GET  /overlay    → HUD overlay (overlay.html)
 *  - POST /api/update → Partial state merge → broadcast
 *  - GET  /api/state  → Full current state
 *  - GET  /api/rules  → Game rules constants
 *  - POST /api/reset-round  → Reset players for new round
 *  - POST /api/next-round   → Proper round transition + economy
 *  - POST /api/swap-sides   → Swap attack/defense
 *  - POST /api/halftime     → Trigger halftime
 *  - Static: /assets/  for agent + weapon images
 * ═══════════════════════════════════════════════════════════
 */

'use strict';

const express = require('express');
const http    = require('http');
const { WebSocketServer } = require('ws');
const path    = require('path');
const fs      = require('fs');
const https   = require('https');

// Ensure assets/caster exists
const casterAssetsPath = path.join(__dirname, 'assets', 'caster');
if (!fs.existsSync(casterAssetsPath)) {
    fs.mkdirSync(casterAssetsPath, { recursive: true });
}

// Ensure assets/mvp exists
const mvpAssetsPath = path.join(__dirname, 'assets', 'mvp');
if (!fs.existsSync(mvpAssetsPath)) {
    fs.mkdirSync(mvpAssetsPath, { recursive: true });
}

// Ensure assets/team-logo exists
const teamLogoAssetsPath = path.join(__dirname, 'assets', 'team-logo');
if (!fs.existsSync(teamLogoAssetsPath)) {
    fs.mkdirSync(teamLogoAssetsPath, { recursive: true });
}

// Ensure assets/player-image exists
const playerImageAssetsPath = path.join(__dirname, 'assets', 'player-image');
if (!fs.existsSync(playerImageAssetsPath)) {
    fs.mkdirSync(playerImageAssetsPath, { recursive: true });
}

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

const PORT = process.env.PORT || 4000;

/* ──────────────────────────────────────────────────────────
   VALORANT GAME RULES — Official mechanics (May 2026)
────────────────────────────────────────────────────────── */
const GAME_RULES = {
    ROUNDS_TO_WIN:        13,
    HALFTIME_ROUND:       12,       // swap sides after round 12
    ROUND_TIMER:          100,      // seconds — standard round
    BUY_PHASE_TIMER:      30,       // seconds — standard buy phase
    BUY_PHASE_TIMER_LONG: 45,       // seconds — round 1, post-halftime, OT
    SPIKE_DETONATION:     45,       // seconds after spike plant
    SPIKE_PLANT_TIME:     4,        // seconds to plant
    SPIKE_DEFUSE_TIME:    7,        // seconds to defuse (3.5s checkpoint)
    STARTING_CREDITS:     800,
    MAX_CREDITS:          9000,
    WIN_BONUS:            3000,
    LOSS_BONUS:           [1900, 2400, 2900], // 1st, 2nd, 3rd+ consecutive loss
    KILL_REWARD:          200,
    SPIKE_PLANT_BONUS:    300,      // per player for attackers on plant
    OVERTIME_CREDITS:     5000,
    OVERTIME_ULT_DEFICIT: 3,        // start 3 short of max in OT
    LIGHT_SHIELD_COST:    400,
    HEAVY_SHIELD_COST:    1000,
    REGEN_SHIELD_COST:    650,
};

/* ──────────────────────────────────────────────────────────
   AGENT ULTIMATE POINT COSTS — May 2026 patch data
────────────────────────────────────────────────────────── */
const AGENT_ULT_COSTS = {
    Astra:     7,
    Breach:    9,
    Brimstone: 8,
    Chamber:   8,
    Clove:     8,
    Cypher:    7,
    Deadlock:  7,
    Fade:      8,
    Gekko:     8,
    Harbor:    7,
    Iso:       7,
    Jett:      8,
    'KAY/O':   8,
    KAYO:      8,
    Killjoy:   9,
    Miks:      8,
    Neon:      8,
    Omen:      7,
    Phoenix:   6,
    Raze:      8,
    Reyna:     6,
    Sage:      7,
    Skye:      8,
    Sova:      8,
    Tejo:      9,
    Veto:      8,
    Viper:     9,
    Vyse:      8,
    Waylay:    8,
    Yoru:      8,
};

function getUltCost(agent) {
    return AGENT_ULT_COSTS[agent] || 7;
}

/* ──────────────────────────────────────────────────────────
   HELPER — create a default player
────────────────────────────────────────────────────────── */
function makePlayer(id, name, agent) {
    return {
        id,
        name,
        agent,
        agentLocked: false,
        alive:    true,
        agentImg: '',
    };
}

/* ──────────────────────────────────────────────────────────
   MASTER STATE — single source of truth
   Admin panel writes here, overlay reads via WebSocket.
────────────────────────────────────────────────────────── */
const state = {
    match: {
        tournament:           'WarCities://Valorant Pro Series',
        subHeading:           'GRAND FINALE',
        bestOf:               3,
        round:                1,
        timer:                100,
        buyTimer:             30,
        phase:                'buy',       // 'buy' | 'combat' | 'end' | 'timeout'
        spikePlanted:         false,
        spikeDefused:         false,
        half:                 1,           // 1 or 2
        overtime:             false,
        overtimeRound:        0,
        maps: [
            { name: 'PEARL',  action: 'ban',   team: 'left'  },
            { name: 'SPLIT',  action: 'ban',   team: 'right' },
            { name: 'LOTUS',  action: 'pick',  team: 'left'  },
            { name: 'HAVEN',  action: 'pick',  team: 'right' },
            { name: 'FRACTURE', action: 'pick', team: 'left' },
            { name: 'ASCENT', action: 'pick',  team: 'right' },
            { name: 'BREEZE', action: 'decider', team: null  },
        ],
    },
    teams: {
        left: {
            name:       'TEAM A',
            tag:        'SEED #1',
            score:      0,
            logoUrl:    '',
            side:       'defense',
            roundWins:  [],
            lossStreak: 0,
            players: [
                makePlayer('p1', 'Player 1', ''),
                makePlayer('p2', 'Player 2', ''),
                makePlayer('p3', 'Player 3', ''),
                makePlayer('p4', 'Player 4', ''),
                makePlayer('p5', 'Player 5', ''),
            ],
        },
        right: {
            name:       'TEAM B',
            tag:        'SEED #2',
            score:      0,
            logoUrl:    '',
            side:       'attack',
            roundWins:  [],
            lossStreak: 0,
            players: [
                makePlayer('p6',  'Player 6',  ''),
                makePlayer('p7',  'Player 7',  ''),
                makePlayer('p8',  'Player 8',  ''),
                makePlayer('p9',  'Player 9',  ''),
                makePlayer('p10', 'Player 10', ''),
            ],
        },
    },
    casters: [
        { id: 'c1', name: 'AKiB', role: 'Host', social: '@AKiB', image: '' }
    ],
    matchWinner: {
        winner: '' // 'left' | 'right' | ''
    },
    mvp: {
        playerId: '', // 'p1' to 'p10' or ''
        image: '',
        kda: '0/0/0',
        customNote: ''
    },
    replay: {
        visible: false
    },
    bracket: {
        apiKey: '',
        username: '',
        tournamentUrl: 'warcitiesroundof16',
        matches: [],
        participants: [],
        lastUpdated: null,
        activeTab: 'upper'
    },
    pause: {
        visible: false,
        type: 'tech',
        teamSide: 'attack'
    },
    startScreen: {
        timer: 120,
        timerActive: false,
        videoVisible: true,
        videoType: 'chromakey',
        videoUrl: ''
    },
    brb: {
        timer: 300,
        timerActive: false,
        message: 'Be Right Back'
    },
    endMessage: 'Thanks For Watching The Stream',
    rosterInfo: {
        visible: false,
        bottomText: 'MATCH STARTING SOON'
    },
    seriesUpdate: {
        visible: false,
        lastCompletedMap: '',
        lastMapScore: '',
        lastMapWinner: '',
        nextMapName: '',
        seriesScoreLeft: 0,
        seriesScoreRight: 0
    },
    matchStats: {
        visible: false,
        mapLabel: '',
        finalScore: '',
        scoreboardImage: '',
        mvpNote: '',
        topAcs: ''
    }
};

// Load Challonge credentials from json file on startup if available
const challongePath = path.join(__dirname, 'challonge.json');
if (fs.existsSync(challongePath)) {
    try {
        const config = JSON.parse(fs.readFileSync(challongePath, 'utf8'));
        if (config.username) state.bracket.username = config.username;
        if (config.apiKey) state.bracket.apiKey = config.apiKey;
        if (config.tournamentUrl) state.bracket.tournamentUrl = config.tournamentUrl;
        console.log('[CHALLONGE] Successfully loaded default credentials from challonge.json');
    } catch (e) {
        console.error('[CHALLONGE] Error loading challonge.json:', e);
    }
}

/* ──────────────────────────────────────────────────────────
   DEEP MERGE — same logic as the client
   Overwrites 'casters' directly, deep merges other objects.
────────────────────────────────────────────────────────── */
function deepMerge(target, src) {
    if (!src || typeof src !== 'object') return;
    for (const key of Object.keys(src)) {
        const srcVal = src[key];
        const tgtVal = target[key];
        if (key === 'casters') {
            target[key] = srcVal;
            continue;
        }
        if (Array.isArray(srcVal)) {
            if (Array.isArray(tgtVal) && tgtVal.length && tgtVal[0] && tgtVal[0].id !== undefined) {
                for (const srcItem of srcVal) {
                    const tgtItem = tgtVal.find(x => x.id === srcItem.id);
                    if (tgtItem) {
                        deepMerge(tgtItem, srcItem);
                    } else if (key !== 'players') {
                        tgtVal.push(srcItem);
                    }
                }
            } else {
                target[key] = srcVal;
            }
        } else if (srcVal && typeof srcVal === 'object' && !Array.isArray(srcVal)) {
            if (!tgtVal || typeof tgtVal !== 'object') target[key] = {};
            deepMerge(target[key], srcVal);
        } else {
            target[key] = srcVal;
        }
    }
}

const STATE_FILE_PATH = path.join(__dirname, 'state.json');

function saveState() {
    try {
        fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf8');
    } catch (e) {
        console.error('[STATE] Failed to save state to state.json:', e);
    }
}

// Load existing state from state.json on startup if available
if (fs.existsSync(STATE_FILE_PATH)) {
    try {
        const loadedState = JSON.parse(fs.readFileSync(STATE_FILE_PATH, 'utf8'));
        for (const key of Object.keys(loadedState)) {
            state[key] = loadedState[key];
        }
        console.log('[STATE] Loaded existing match state from state.json');
    } catch (e) {
        console.error('[STATE] Error loading state.json:', e);
    }
}

/* ──────────────────────────────────────────────────────────
   BROADCAST — send state to all connected overlays
────────────────────────────────────────────────────────── */
function broadcast(patch) {
    const msg = JSON.stringify(patch);
    wss.clients.forEach(ws => {
        if (ws.readyState === 1) ws.send(msg);
    });
}

function swapTeamsFull() {
    // Flip roles so the UI attack/defense assignments flip as well
    state.teams.left.side = state.teams.left.side === 'attack' ? 'defense' : 'attack';
    state.teams.right.side = state.teams.right.side === 'attack' ? 'defense' : 'attack';
}

/* ──────────────────────────────────────────────────────────
   ECONOMY HELPERS
────────────────────────────────────────────────────────── */

/**
 * Calculate loss bonus based on consecutive loss count.
 * 1st loss = 1900, 2nd = 2400, 3rd+ = 2900
 */
function getLossBonus(lossStreak) {
    const idx = Math.min(lossStreak - 1, GAME_RULES.LOSS_BONUS.length - 1);
    return GAME_RULES.LOSS_BONUS[Math.max(0, idx)];
}

/**
 * Determine correct buy phase timer for current round.
 * 45s for: round 1 of each half, first OT round, post-halftime.
 * 30s for all other rounds.
 */
function getBuyPhaseTimer(round, isOvertime) {
    if (isOvertime) return GAME_RULES.BUY_PHASE_TIMER_LONG;
    if (round === 1 || round === GAME_RULES.HALFTIME_ROUND + 1) {
        return GAME_RULES.BUY_PHASE_TIMER_LONG;
    }
    return GAME_RULES.BUY_PHASE_TIMER;
}

/**
 * Check if we're at halftime boundary.
 */
function isHalftimeRound(round) {
    return round === GAME_RULES.HALFTIME_ROUND + 1 && !state.match.overtime;
}

/**
 * Check if match is in overtime condition (both teams ≥ 12).
 */
function isOvertimeCondition() {
    return state.teams.left.score >= GAME_RULES.ROUNDS_TO_WIN - 1 &&
           state.teams.right.score >= GAME_RULES.ROUNDS_TO_WIN - 1;
}

/* ──────────────────────────────────────────────────────────
   MIDDLEWARE
────────────────────────────────────────────────────────── */
app.use(express.json());

// ── Basic Authentication Middleware ──
// Secures the admin control panel, challonge credentials, and all state-modifying POST requests
app.use((req, res, next) => {
    const isDestructiveApi = req.method === 'POST';
    const isAdminPanel = req.path === '/' || req.path === '/admin.html' || req.path === '/challonge.json';
    const isBypassPath = req.path === '/api/reset-round' || req.path === '/api/update' || req.path === '/api/confirm-veto';
    
    if ((isAdminPanel || isDestructiveApi) && !isBypassPath) {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            res.setHeader('WWW-Authenticate', 'Basic realm="ValorGG Admin"');
            return res.status(401).send('Authentication required.');
        }

        const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
        const user = auth[0];
        const pass = auth[1];

        if (user === 'hippo' && pass === 'Akinny1245@') {
            next();
        } else {
            res.setHeader('WWW-Authenticate', 'Basic realm="ValorGG Admin"');
            return res.status(401).send('Authentication failed. Invalid credentials.');
        }
    } else {
        next();
    }
});

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(__dirname));

/* ──────────────────────────────────────────────────────────
   ROUTES
────────────────────────────────────────────────────────── */

// Admin panel
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Overlay
app.get('/overlay', (req, res) => {
    res.sendFile(path.join(__dirname, 'overlay.html'));
});

// Start Overlay [NEW]
app.get('/start', (req, res) => {
    res.sendFile(path.join(__dirname, 'start.html'));
});

// Map Veto Overlay
app.get('/map-veto', (req, res) => {
    res.sendFile(path.join(__dirname, 'map-veto.html'));
});

// Agent Pick Overlay
app.get('/agent', (req, res) => {
    res.sendFile(path.join(__dirname, 'agent.html'));
});

// Caster Desk Overlay
app.get('/caster', (req, res) => {
    res.sendFile(path.join(__dirname, 'caster.html'));
});

// Endpoint to list caster images from assets/caster
app.get('/api/caster-images', (req, res) => {
    fs.readdir(casterAssetsPath, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to read caster images directory' });
        }
        // Filter to only include image file extensions
        const images = files.filter(file => /\.(png|jpe?g|webp|gif|svg)$/i.test(file));
        res.json({ images });
    });
});

// Match Winner Overlay
app.get('/winner', (req, res) => {
    res.sendFile(path.join(__dirname, 'winner.html'));
});

// Match MVP Overlay
app.get('/mvp', (req, res) => {
    res.sendFile(path.join(__dirname, 'mvp.html'));
});

// Replay Broadcast Overlay
app.get('/replay', (req, res) => {
    res.sendFile(path.join(__dirname, 'replay.html'));
});

// Tournament Bracket Overlay
app.get('/bracket', (req, res) => {
    res.sendFile(path.join(__dirname, 'bracket.html'));
});

// Match Pause Overlay
app.get('/pause', (req, res) => {
    res.sendFile(path.join(__dirname, 'pause.html'));
});

// Be Right Back Overlay
app.get('/brb', (req, res) => {
    res.sendFile(path.join(__dirname, 'brb.html'));
});

// Stream Ending Overlay
app.get('/end', (req, res) => {
    res.sendFile(path.join(__dirname, 'end.html'));
});

// Roster Info Overlay
app.get('/roster-info', (req, res) => {
    res.sendFile(path.join(__dirname, 'roster-info.html'));
});

// Series Update Overlay
app.get('/series-update', (req, res) => {
    res.sendFile(path.join(__dirname, 'series-update.html'));
});

// Match Statistics Overlay
app.get('/stats', (req, res) => {
    res.sendFile(path.join(__dirname, 'stats.html'));
});

// Endpoint to list MVP images from assets/mvp
app.get('/api/mvp-images', (req, res) => {
    fs.readdir(mvpAssetsPath, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to read MVP images directory' });
        }
        // Filter to only include image file extensions
        const images = files.filter(file => /\.(png|jpe?g|webp|gif|svg)$/i.test(file));
        res.json({ images });
    });
});

// Endpoint to list team logos from assets/team-logo
app.get('/api/team-logos', (req, res) => {
    fs.readdir(teamLogoAssetsPath, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to read team logos directory' });
        }
        // Filter to only include image file extensions
        const images = files.filter(file => /\.(png|jpe?g|webp|gif|svg)$/i.test(file));
        res.json({ images });
    });
});

// Endpoint to load rosters database from info.json
app.get('/api/rosters', (req, res) => {
    const rostersPath = path.join(__dirname, 'info.json');
    if (!fs.existsSync(rostersPath)) {
        return res.json([]);
    }
    fs.readFile(rostersPath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to read rosters database file' });
        }
        try {
            const parsed = JSON.parse(data);
            res.json(parsed);
        } catch(e) {
            res.status(500).json({ error: 'Failed to parse rosters JSON' });
        }
    });
});

// Endpoint to load dynamic maps configuration pool from maps.json
app.get('/api/maps', (req, res) => {
    const mapsPath = path.join(__dirname, 'maps.json');
    if (!fs.existsSync(mapsPath)) {
        return res.json(["PEARL", "SPLIT", "LOTUS", "HAVEN", "FRACTURE", "ASCENT", "BREEZE"]);
    }
    fs.readFile(mapsPath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to read maps configuration file' });
        }
        try {
            res.json(JSON.parse(data));
        } catch(e) {
            res.status(500).json({ error: 'Failed to parse maps JSON' });
        }
    });
});

function checkAndApplyMapSidesSwap() {
    if (state.match && Array.isArray(state.match.maps)) {
        const currentMap = state.match.maps.find(m => m.status === 'current');
        if (currentMap && currentMap.defense && currentMap.attack) {
            if (currentMap.defense === 'right') {
                console.log(`[MAP SWAP] Swapping team positions to match starting sides for ${currentMap.name}`);
                
                // Swap team slots
                const tempTeam = state.teams.left;
                state.teams.left = state.teams.right;
                state.teams.right = tempTeam;

                // Reset map-specific state fields
                state.teams.left.side = 'defense';
                state.teams.left.score = 0;
                state.teams.left.roundWins = [];
                state.teams.left.lossStreak = 0;

                state.teams.right.side = 'attack';
                state.teams.right.score = 0;
                state.teams.right.roundWins = [];
                state.teams.right.lossStreak = 0;

                // Reset players to alive
                const allPlayers = [...state.teams.left.players, ...state.teams.right.players];
                allPlayers.forEach(p => {
                    p.alive = true;
                });

                // Swap left/right references in state.match.maps
                state.match.maps.forEach(m => {
                    if (m.team === 'left') m.team = 'right';
                    else if (m.team === 'right') m.team = 'left';

                    if (m.defense === 'left') m.defense = 'right';
                    else if (m.defense === 'right') m.defense = 'left';

                    if (m.attack === 'left') m.attack = 'right';
                    else if (m.attack === 'right') m.attack = 'left';
                });

                return true; // swap occurred
            }
        }
    }
    return false; // no swap occurred
}

// Endpoint to confirm a veto selection, log it, and update state
app.post('/api/confirm-veto', (req, res) => {
    const auditPath = path.join(__dirname, 'veto_audit.json');
    let logs = [];
    if (fs.existsSync(auditPath)) {
        try {
            logs = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
        } catch(e) {
            console.error('Error reading veto_audit.json:', e);
        }
    }
    
    logs.push({
        timestamp: req.body.timestamp || new Date().toISOString(),
        format: req.body.format,
        teamA: req.body.teamA,
        teamB: req.body.teamB,
        maps: req.body.maps
    });

    try {
        fs.writeFileSync(auditPath, JSON.stringify(logs, null, 2), 'utf8');
    } catch(e) {
        console.error('Error writing to veto_audit.json:', e);
    }

    if (req.body.updateState) {
        deepMerge(state, req.body.updateState);
        checkAndApplyMapSidesSwap();
        broadcast({ _replaceTeams: { left: state.teams.left, right: state.teams.right }, match: state.match });
        saveState();
    }

    res.json({ ok: true });
});

// Map Veto Simulator Overlay/Page Route
app.get('/do-map-veto', (req, res) => {
    res.sendFile(path.join(__dirname, 'do-map-veto.html'));
});

// Companion Dashboard Route
app.get('/aliveordead', (req, res) => {
    res.sendFile(path.join(__dirname, 'companion.html'));
});

// ── ROI Config Persistence ──
const defaultRoi = {
    left:  { top: 1.5, left: 42.5, width: 3.5, height: 5.5 },
    right: { top: 1.5, left: 54.5, width: 3.5, height: 5.5 }
};

app.get('/api/roi-config', (req, res) => {
    const roiPath = path.join(__dirname, 'roi_config.json');
    if (!fs.existsSync(roiPath)) {
        return res.json(defaultRoi);
    }
    fs.readFile(roiPath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to read ROI config file' });
        }
        try {
            res.json(JSON.parse(data));
        } catch (e) {
            res.json(defaultRoi);
        }
    });
});

app.post('/api/roi-config', (req, res) => {
    const roiPath = path.join(__dirname, 'roi_config.json');
    fs.writeFile(roiPath, JSON.stringify(req.body, null, 4), 'utf8', (err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to write ROI config file' });
        }
        res.json({ ok: true });
    });
});

// Get current full state
app.get('/api/state', (req, res) => {
    res.json(state);
});

// Get game rules constants
app.get('/api/rules', (req, res) => {
    res.json({ rules: GAME_RULES, ultCosts: AGENT_ULT_COSTS });
});

// Start Screen Countdown Timer Ticker
let startScreenInterval = null;
function startStartScreenTimer() {
    if (startScreenInterval) return;
    startScreenInterval = setInterval(() => {
        if (state.startScreen && state.startScreen.timerActive) {
            if (state.startScreen.timer > 0) {
                state.startScreen.timer -= 1;
                broadcast({ startScreen: { timer: state.startScreen.timer } });
            } else {
                state.startScreen.timerActive = false;
                broadcast({ startScreen: { timerActive: false } });
                stopStartScreenTimer();
            }
        } else {
            stopStartScreenTimer();
        }
    }, 1000);
}

function stopStartScreenTimer() {
    if (startScreenInterval) {
        clearInterval(startScreenInterval);
        startScreenInterval = null;
    }
}

// BRB Countdown Timer Ticker [NEW]
let brbInterval = null;
function startBrbTimer() {
    if (brbInterval) return;
    brbInterval = setInterval(() => {
        if (state.brb && state.brb.timerActive) {
            if (state.brb.timer > 0) {
                state.brb.timer -= 1;
                broadcast({ brb: { timer: state.brb.timer } });
            } else {
                state.brb.timerActive = false;
                broadcast({ brb: { timerActive: false } });
                stopBrbTimer();
            }
        } else {
            stopBrbTimer();
        }
    }, 1000);
}

function stopBrbTimer() {
    if (brbInterval) {
        clearInterval(brbInterval);
        brbInterval = null;
    }
}

// Partial update — merge and broadcast
app.post('/api/update', (req, res) => {
    const patch = req.body;
    deepMerge(state, patch);

    const swapOccurred = checkAndApplyMapSidesSwap();

    // Check if startScreen timer is activated
    if (patch.startScreen) {
        if (patch.startScreen.timerActive === true) {
            startStartScreenTimer();
        } else if (patch.startScreen.timerActive === false) {
            stopStartScreenTimer();
        }
    }

    // Check if brb timer is activated
    if (patch.brb) {
        if (patch.brb.timerActive === true) {
            startBrbTimer();
        } else if (patch.brb.timerActive === false) {
            stopBrbTimer();
        }
    }

    if (swapOccurred) {
        broadcast({ _replaceTeams: { left: state.teams.left, right: state.teams.right }, match: state.match });
    } else {
        broadcast(patch);
    }
    saveState();
    res.json({ ok: true });
});

// ── Reset Round ────────────────────────────────────────
// Resets all players to alive/full HP for a new round.
// Does NOT handle economy — use /api/next-round for that.
app.post('/api/reset-round', (req, res) => {
    const allPlayers = [...state.teams.left.players, ...state.teams.right.players];
    allPlayers.forEach(p => {
        p.alive = true;
    });
    state.match.spikePlanted         = false;
    state.match.spikeDefused         = false;
    state.match.phase                = 'buy';
    state.match.round               += 1;

    let didSwap = false;

    // Halftime detection
    if (isHalftimeRound(state.match.round)) {
        swapTeamsFull();
        state.match.half = 2;
        didSwap = true;
    }

    // Overtime detection
    if (isOvertimeCondition() && !state.match.overtime) {
        state.match.overtime      = true;
        state.match.overtimeRound = 1;
    }
    if (state.match.overtime) {
        state.match.overtimeRound += 1;
        // OT: swap sides every round
        swapTeamsFull();
        didSwap = true;
    }

    // Set correct buy phase timer
    state.match.timer = getBuyPhaseTimer(state.match.round, state.match.overtime);

    if (didSwap) {
        broadcast({ _replaceTeams: { left: state.teams.left, right: state.teams.right }, match: state.match });
    } else {
        broadcast(state);
    }
    saveState();
    res.json({ ok: true, round: state.match.round, overtime: state.match.overtime });
});

// ── Next Round (with economy) ──────────────────────────
// Call this after a round ends. Provide winner ('left' | 'right')
// and optional spikePlanted boolean.
app.post('/api/next-round', (req, res) => {
    const { winner, spikePlanted: spikeWasPlanted } = req.body;
    if (!winner || !['left', 'right'].includes(winner)) {
        return res.status(400).json({ error: 'Provide "winner": "left" or "right"' });
    }

    const loser    = winner === 'left' ? 'right' : 'left';
    const winTeam  = state.teams[winner];
    const loseTeam = state.teams[loser];

    // Update scores
    winTeam.score += 1;
    winTeam.roundWins.push(true);
    loseTeam.roundWins.push(false);

    // ── Reset for new round ──
    const allPlayers = [...state.teams.left.players, ...state.teams.right.players];
    allPlayers.forEach(p => {
        p.alive    = true;
    });

    state.match.spikePlanted         = false;
    state.match.spikeDefused         = false;
    state.match.phase                = 'buy';
    state.match.round               += 1;

    let didSwap = false;

    // ── Halftime check ──
    if (isHalftimeRound(state.match.round)) {
        swapTeamsFull();
        state.match.half = 2;
        didSwap = true;
    }

    // ── Overtime check ──
    if (isOvertimeCondition()) {
        if (!state.match.overtime) {
            state.match.overtime      = true;
            state.match.overtimeRound = 0;
        }
        state.match.overtimeRound += 1;
        // OT: swap sides every round
        swapTeamsFull();
        didSwap = true;
    }

    // Set correct buy phase timer
    state.match.timer = getBuyPhaseTimer(state.match.round, state.match.overtime);

    if (didSwap) {
        broadcast({ _replaceTeams: { left: state.teams.left, right: state.teams.right }, match: state.match });
    } else {
        broadcast(state);
    }
    saveState();
    res.json({
        ok: true,
        round:    state.match.round,
        score:    { left: state.teams.left.score, right: state.teams.right.score },
        overtime: state.match.overtime,
    });
});

// ── Halftime (explicit) ────────────────────────────────
app.post('/api/halftime', (req, res) => {
    swapTeamsFull();
    state.match.half = 2;

    broadcast({ _replaceTeams: { left: state.teams.left, right: state.teams.right }, match: state.match });
    saveState();
    res.json({ ok: true, half: 2, left: state.teams.left.side, right: state.teams.right.side });
});

// Swap sides
app.post('/api/swap-sides', (req, res) => {
    swapTeamsFull();

    broadcast({ _replaceTeams: { left: state.teams.left, right: state.teams.right } });
    saveState();
    res.json({ ok: true, left: state.teams.left.side, right: state.teams.right.side });
});

/* ──────────────────────────────────────────────────────────
   CHALLONGE SECURE API SYNC PROXY
   ────────────────────────────────────────────────────────── */

function extractChallongeId(input) {
    if (!input) return '';
    let cleaned = input.trim();
    
    // Remove query params and hash
    cleaned = cleaned.split('?')[0].split('#')[0];
    
    // Remove trailing slash
    if (cleaned.endsWith('/')) {
        cleaned = cleaned.slice(0, -1);
    }
    
    // Remove protocol and www.
    cleaned = cleaned.replace(/^(https?:\/\/)?(www\.)?/, '');
    
    if (cleaned.includes('challonge.com')) {
        const urlParts = cleaned.split('/');
        const host = urlParts[0]; // e.g. "org.challonge.com" or "challonge.com"
        
        // Remove port if any
        const hostWithoutPort = host.split(':')[0];
        const hostParts = hostWithoutPort.split('.');
        
        let subdomain = '';
        if (hostParts.length > 2 && hostParts[0] !== 'www') {
            subdomain = hostParts[0];
        }
        
        // The remaining path parts
        const pathParts = urlParts.slice(1).filter(part => part.length > 0);
        
        if (pathParts.length > 1) {
            // e.g. challonge.com/subdomain/my_tournament
            if (!subdomain) {
                subdomain = pathParts[0];
                const slug = pathParts[1];
                return `${subdomain}-${slug}`;
            }
        }
        
        // If we have a subdomain in host and a slug in path
        if (subdomain && pathParts.length > 0) {
            const slug = pathParts[0];
            return `${subdomain}-${slug}`;
        }
        
        // Otherwise just take the last part of path
        if (pathParts.length > 0) {
            return pathParts[pathParts.length - 1];
        }
    }
    
    // If it's already a slug or subdomain-slug
    return cleaned;
}

function fetchChallonge(username, apiKey, endpoint) {
    return new Promise((resolve, reject) => {
        const auth = Buffer.from(`${username}:${apiKey}`).toString('base64');
        const options = {
            hostname: 'api.challonge.com',
            path: `/v1/${endpoint}`,
            method: 'GET',
            headers: {
                'Authorization': `Basic ${auth}`,
                'User-Agent': 'ValorGG-HUD'
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(data)); }
                    catch (e) { reject(e); }
                } else {
                    let errMsg = `HTTP Status ${res.statusCode}`;
                    if (res.statusCode === 401) {
                        errMsg = 'Invalid Challonge Username or API Key. Please verify your credentials.';
                    } else if (res.statusCode === 404) {
                        errMsg = 'Tournament not found on Challonge. Please verify the URL/ID or ensure the tournament is public/accessible.';
                    } else if (res.statusCode === 403) {
                        errMsg = 'Access Forbidden. Please check your Challonge settings or tournament visibility.';
                    } else {
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.errors && parsed.errors.length > 0) {
                                errMsg += `: ${parsed.errors.join(', ')}`;
                            }
                        } catch (e) {}
                    }
                    reject(new Error(errMsg));
                }
            });
        });
        req.on('error', (err) => { reject(err); });
        req.end();
    });
}

app.post('/api/bracket/sync', async (req, res) => {
    const { username, apiKey, tournamentUrl } = req.body;
    if (!username || !apiKey || !tournamentUrl) {
        return res.status(400).json({ error: 'Please provide username, apiKey, and tournamentUrl' });
    }

    try {
        console.log(`[CHALLONGE] Input URL/ID: ${tournamentUrl}`);
        const tournamentId = extractChallongeId(tournamentUrl);
        console.log(`[CHALLONGE] Extracted ID for API: ${tournamentId}`);
        
        // 1. Fetch participants and matches in parallel
        const [participantsData, matchesData] = await Promise.all([
            fetchChallonge(username, apiKey, `tournaments/${tournamentId}/participants.json`),
            fetchChallonge(username, apiKey, `tournaments/${tournamentId}/matches.json`)
        ]);

        // 2. Clean and format participants
        const participants = participantsData.map(p => ({
            id: p.participant.id,
            name: p.participant.name || p.participant.display_name,
            seed: p.participant.seed
        }));

        // 3. Clean and format matches
        const matches = matchesData.map(m => ({
            id: m.match.id,
            state: m.match.state,
            round: m.match.round,
            player1Id: m.match.player1_id,
            player2Id: m.match.player2_id,
            winnerId: m.match.winner_id,
            scoresCsv: m.match.scores_csv,
            suggestedPlayOrder: m.match.suggested_play_order
        }));

        // 4. Update state
        state.bracket.apiKey = apiKey;
        state.bracket.username = username;
        state.bracket.tournamentUrl = tournamentUrl;
        state.bracket.participants = participants;
        state.bracket.matches = matches;
        state.bracket.lastUpdated = new Date().toISOString();

        // 5. Broadcast to overlays
        broadcast({ bracket: state.bracket });

        saveState();
        res.json({ ok: true, participantsCount: participants.length, matchesCount: matches.length });
    } catch (err) {
        console.error('[CHALLONGE] Sync failed:', err);
        res.status(500).json({ error: err.message || 'Sync failed' });
    }
});

/* ──────────────────────────────────────────────────────────
   WEBSOCKET — overlay clients connect here
────────────────────────────────────────────────────────── */
wss.on('connection', (ws) => {
    console.log('[WS] Overlay connected. Total:', wss.clients.size);
    ws.send(JSON.stringify(state));
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data && typeof data === 'object') {
                deepMerge(state, data);

                // Check if startScreen timer is activated
                if (data.startScreen) {
                    if (data.startScreen.timerActive === true) {
                        startStartScreenTimer();
                    } else if (data.startScreen.timerActive === false) {
                        stopStartScreenTimer();
                    }
                }

                // Check if brb timer is activated
                if (data.brb) {
                    if (data.brb.timerActive === true) {
                        startBrbTimer();
                    } else if (data.brb.timerActive === false) {
                        stopBrbTimer();
                    }
                }

                // Broadcast the change to all other connected clients
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === 1) { // 1 is OPEN
                        client.send(JSON.stringify(data));
                    }
                });

                saveState();
            }
        } catch (err) {
            console.error('[WS] Error processing incoming client message:', err);
        }
    });

    ws.on('close', () => console.log('[WS] Overlay disconnected. Total:', wss.clients.size));
});

/* ──────────────────────────────────────────────────────────
   START
────────────────────────────────────────────────────────── */
server.listen(PORT, () => {
    console.log(`\n  ╔══════════════════════════════════════════╗`);
    console.log(`  ║   VCT HUD Server running on port ${PORT}    ║`);
    console.log(`  ╠══════════════════════════════════════════╣`);
    console.log(`  ║   Admin:   http://localhost:${PORT}         ║`);
    console.log(`  ║   Overlay: http://localhost:${PORT}/overlay  ║`);
    console.log(`  ╚══════════════════════════════════════════╝\n`);
});
