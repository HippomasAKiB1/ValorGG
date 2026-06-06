/**
 * ═══════════════════════════════════════════════════════════
 *  VCT BROADCAST HUD  —  script.js
 *
 *  Architecture
 *  ─────────────
 *  HUD.state          — single source of truth for all HUD data
 *  HUD.update(patch)  — merge any partial update → re-render
 *  HUD.connect(url)   — WebSocket data bridge (JSON messages)
 *  HUD.poll(url, ms)  — HTTP polling fallback
 *
 *  Backend sends JSON shaped like HUD.state (partial or full).
 *  Every field maps directly to a DOM element via the renderer.
 *
 *  WebSocket message examples:
 *    { "match": { "timer": 42 } }
 *    { "teams": { "left": { "score": 13 } } }
 *    { "teams": { "left": { "players": [{ "id": "p1", "hp": 55 }] } } }
 *    { "observed": { "name": "Adoxcol", "k": 18 } }
 * ═══════════════════════════════════════════════════════════
 */

'use strict';

/* ──────────────────────────────────────────────────────────
   WEAPON SVG SILHOUETTES
   Add more weapons by appending to this map.
   Each value is an inline SVG string.
────────────────────────────────────────────────────────── */
const WEAPON_SVGS = {
    Vandal:   `<svg viewBox="0 0 80 18"><path d="M2,9 L6,5 L12,5 L12,3 L57,3 L62,5 L70,5 L72,7 L78,7 L78,9 L72,9 L70,11 L64,11 L64,9 L57,9 L57,13 L12,13 L12,11 L8,11 L6,13 L2,13 Z M14,6 L14,8 L19,8 L19,6 Z M23,5 L23,7 L29,7 L29,5 Z"/></svg>`,
    Phantom:  `<svg viewBox="0 0 80 18"><path d="M2,9 L5,5 L14,5 L14,3 L51,3 L55,5 L66,5 L68,7 L73,7 L73,9 L68,9 L66,11 L55,11 L51,13 L14,13 L14,11 L5,11 Z M16,6 L16,8 L22,8 L22,6 Z M26,5 L26,7 L32,7 L32,5 Z M43,4 L43,8 L47,8 L47,4 Z"/></svg>`,
    Operator: `<svg viewBox="0 0 100 18"><path d="M2,7 L8,4 L18,4 L20,6 L40,6 L40,3 L88,3 L93,5 L97,5 L97,8 L93,8 L88,10 L40,10 L40,13 L20,13 L18,12 L8,12 L2,11 Z M22,6 L22,8 L30,8 L30,6 Z M35,5 L35,7 L39,7 L39,5 Z"/></svg>`,
    Sheriff:  `<svg viewBox="0 0 55 18"><path d="M4,7 L8,4 L16,4 L20,6 L45,6 L49,4 L52,6 L52,11 L49,13 L45,11 L20,11 L16,13 L8,13 L4,11 Z M22,7 L22,10 L28,10 L28,7 Z M32,6 L32,9 L38,9 L38,6 Z"/></svg>`,
    Classic:  `<svg viewBox="0 0 48 18"><path d="M3,8 L7,5 L15,5 L18,7 L38,7 L42,5 L46,7 L46,11 L42,13 L38,11 L18,11 L15,13 L7,13 L3,11 Z M20,7 L20,10 L26,10 L26,7 Z"/></svg>`,
    Guardian: `<svg viewBox="0 0 72 18"><path d="M2,9 L5,5 L13,5 L13,3 L48,3 L52,5 L62,5 L64,7 L68,7 L68,9 L64,9 L62,11 L52,11 L48,13 L13,13 L13,11 L5,11 Z M15,6 L15,8 L21,8 L21,6 Z M25,5 L25,7 L31,7 L31,5 Z"/></svg>`,
    Knife:    `<svg viewBox="0 0 38 18"><path d="M4,9 L10,4 L34,7 L34,11 L10,14 Z M12,7 L12,11 L18,11 L18,7 Z"/></svg>`,
};

/* ──────────────────────────────────────────────────────────
   AGENT AVATAR HELPER
   Replace with real agent portrait URLs when available.
   Backend can also send `agentImg` field directly.
────────────────────────────────────────────────────────── */
const AGENT_PALETTE = {
    Omen:    { bg: '1a0d2e', fg: 'c084fc' },
    Sova:    { bg: '0d2a3f', fg: '60a5fa' },
    Viper:   { bg: '0a2614', fg: '4ade80' },
    Jett:    { bg: '0d1a3f', fg: '93c5fd' },
    Killjoy: { bg: '2a1f00', fg: 'fbbf24' },
    Astra:   { bg: '1a0a2e', fg: 'a78bfa' },
    Skye:    { bg: '0d2614', fg: '86efac' },
    Raze:    { bg: '2e0d00', fg: 'f97316' },
    Cypher:  { bg: '1a1a0d', fg: 'e5e7eb' },
    Phoenix: { bg: '2e1200', fg: 'fbbf24' },
    Reyna:   { bg: '2e0020', fg: 'f0abfc' },
    Sage:    { bg: '002e20', fg: '6ee7b7' },
    Breach:  { bg: '2e1a00', fg: 'fb923c' },
    Brimstone:{ bg: '1a0000', fg: 'fca5a5' },
    Yoru:    { bg: '00102e', fg: '818cf8' },
    Neon:    { bg: '001a2e', fg: '38bdf8' },
    Harbor:  { bg: '002020', fg: '2dd4bf' },
    Fade:    { bg: '0d0d2e', fg: 'c4b5fd' },
    Gekko:   { bg: '102e00', fg: 'a3e635' },
    Deadlock:{ bg: '1a1a1a', fg: 'e5e7eb' },
    Iso:     { bg: '001a2e', fg: '7dd3fc' },
    Chamber: { bg: '1a1a2e', fg: 'e2c870' },
    Clove:   { bg: '2e0a2e', fg: 'e879f9' },
    Tejo:    { bg: '1a2010', fg: 'bef264' },
    Veto:    { bg: '0d1a2e', fg: '67e8f9' },
    Waylay:  { bg: '1a0d1a', fg: 'c084fc' },
    Miks:    { bg: '102020', fg: '5eead4' },
    Vyse:    { bg: '1a0020', fg: 'd8b4fe' },
};

const AGENT_ULT_COSTS = {
    Astra: 7, Breach: 9, Brimstone: 8, Chamber: 8, Clove: 8,
    Cypher: 7, Deadlock: 7, Fade: 8, Gekko: 8, Harbor: 7,
    Iso: 7, Jett: 8, 'KAY/O': 8, KAYO: 8, Killjoy: 9,
    Miks: 8, Neon: 8, Omen: 7, Phoenix: 6, Raze: 8,
    Reyna: 6, Sage: 7, Skye: 8, Sova: 8, Tejo: 9,
    Veto: 8, Viper: 9, Vyse: 8, Waylay: 8, Yoru: 8,
};

function agentAvatarUrl(agentName, size = 64) {
    if (agentName) {
        const safeName = agentName.replace('/', '').toLowerCase();
        return `/assets/agent/${safeName}.webp`;
    }
    return `https://ui-avatars.com/api/?name=?&background=1a1a2e&color=ffffff&size=${size}&bold=true`;
}

function getWeaponSvg(weapon) {
    return WEAPON_SVGS[weapon] || WEAPON_SVGS.Vandal;
}

function weaponImgHtml(weapon) {
    const fallbackSvg = (getWeaponSvg(weapon) || '').replace(/"/g, '&quot;');
    return `<img src="/assets/weapons/${weapon}.webp" alt="${weapon}" class="weapon-img" onerror="this.outerHTML='${fallbackSvg}'">`;
}

/* ──────────────────────────────────────────────────────────
   HUD STATE  —  Single source of truth
   This is the exact shape the backend should target.
────────────────────────────────────────────────────────── */
const HUD = {

    state: {
        match: {
            tournament:    'VCT EMEA – STAGE 1 – PLAYOFFS – DAY 3',
            sponsor:       'AORUS',
            round:         22,
            timer:         55,       // seconds
            phase:         'combat', // 'buy' | 'combat' | 'end'
            spikePlanted:  false,
            spikeDetonationTimer: 45,
            overtime:      false,
            overtimeRound: 0,
            half:          'first',  // 'first' | 'second'
            bestOf:        3,
            maps: [
                { name: 'BREEZE', score: '13-4', status: 'completed' },
                { name: 'ASCENT', score: null,   status: 'current'   },
                { name: 'LOTUS',  score: null,   status: 'decider'   },
            ],
        },
        teams: {
            left: {
                name:      'BBL',
                tag:       'OMEGA #4',
                score:     12,
                logoUrl:   '',        // set to real CDN URL or leave empty for initials
                side:      'defense',  // 'attack' | 'defense'
                lossStreak: 0,
                roundWins: [true, true, true, false],
                players: [
                    {
                        id: 'p1', name: 'Loita',       agent: 'Omen',
                        hp: 100, maxHp: 100, shield: 25, alive: true,
                        ult: { ready: true,  points: 7,  maxPoints: 7  },
                        abilities: [true, false, true, true],
                        weapon: 'Operator', credits: 2400,
                        agentImg: '',   // override with real portrait URL
                        stats: { k: 8, d: 4, a: 3 },
                    },
                    {
                        id: 'p2', name: 'lovers rock',  agent: 'Sova',
                        hp: 100, maxHp: 100, shield: 25, alive: true,
                        ult: { ready: false, points: 4,  maxPoints: 7  },
                        abilities: [true, true, false],
                        weapon: 'Vandal', credits: 1250,
                        agentImg: '',
                        stats: { k: 17, d: 17, a: 6 },
                    },
                    {
                        id: 'p3', name: 'Rosé',         agent: 'Viper',
                        hp: 100, maxHp: 100, shield: 25, alive: true,
                        ult: { ready: true,  points: 7,  maxPoints: 7  },
                        abilities: [true, true, true],
                        weapon: 'Operator', credits: 4450,
                        agentImg: '',
                        stats: { k: 12, d: 8, a: 5 },
                    },
                    {
                        id: 'p4', name: 'Lar0k',        agent: 'Jett',
                        hp: 100, maxHp: 100, shield: 25, alive: true,
                        ult: { ready: false, points: 6,  maxPoints: 7  },
                        abilities: [true, false],
                        weapon: 'Vandal', credits: 50,
                        agentImg: '',
                        stats: { k: 20, d: 10, a: 2 },
                    },
                    {
                        id: 'p5', name: 'Crewen',       agent: 'Killjoy',
                        hp: 100, maxHp: 100, shield: 25, alive: true,
                        ult: { ready: true,  points: 8,  maxPoints: 8  },
                        abilities: [true, true, false, true],
                        weapon: 'Vandal', credits: 800,
                        agentImg: '',
                        stats: { k: 5, d: 6, a: 9 },
                    },
                ],
            },
            right: {
                name:      'TH',
                tag:       'ALPHA #3',
                score:     9,
                logoUrl:   '',
                side:      'attack',
                lossStreak: 0,
                roundWins: [true, false, false, false],
                players: [
                    {
                        id: 'p6',  name: 'RieNs',      agent: 'Astra',
                        hp: 100, maxHp: 100, shield: 50, alive: true,
                        ult: { ready: true,  points: 5, maxPoints: 5 },
                        abilities: [true, true, false],
                        weapon: 'Vandal', credits: 2050,
                        agentImg: '',
                        stats: { k: 6, d: 5, a: 8 },
                    },
                    {
                        id: 'p7',  name: 'benjyfishy',  agent: 'Skye',
                        hp: 100, maxHp: 100, shield: 50, alive: true,
                        ult: { ready: false, points: 5, maxPoints: 6 },
                        abilities: [true, false, true],
                        weapon: 'Vandal', credits: 1300,
                        agentImg: '',
                        stats: { k: 9, d: 11, a: 4 },
                    },
                    {
                        id: 'p8',  name: 'Boo',         agent: 'Raze',
                        hp: 100, maxHp: 100, shield: 50, alive: true,
                        ult: { ready: true,  points: 6, maxPoints: 6 },
                        abilities: [true, true, true],
                        weapon: 'Vandal', credits: 4300,
                        agentImg: '',
                        stats: { k: 15, d: 9, a: 1 },
                    },
                    {
                        id: 'p9',  name: 'WoOt',        agent: 'Cypher',
                        hp: 100, maxHp: 100, shield: 50, alive: true,
                        ult: { ready: false, points: 3, maxPoints: 6 },
                        abilities: [true, false],
                        weapon: 'Vandal', credits: 2550,
                        agentImg: '',
                        stats: { k: 7, d: 8, a: 11 },
                    },
                    {
                        id: 'p10', name: 'koshmaras',   agent: 'Phoenix',
                        hp: 100, maxHp: 100, shield: 50, alive: true,
                        ult: { ready: false, points: 2, maxPoints: 7 },
                        abilities: [false, true, true],
                        weapon: 'Vandal', credits: 950,
                        agentImg: '',
                        stats: { k: 11, d: 13, a: 6 },
                    },
                ],
            },
        },
    },

    /* ────────────────────────────────────────────────────
       update(patch)
       Deep-merge a partial state object into HUD.state,
       then re-render only what changed.
       Call this from WebSocket / polling handlers.
    ──────────────────────────────────────────────────── */
    update(patch) {
        let forceTeamsRender = false;
        if (patch._replaceTeams) {
            this.state.teams = patch._replaceTeams;
            delete patch._replaceTeams; 
            forceTeamsRender = true;
        }
        deepMerge(this.state, patch);
        
        // If we replaced teams, make sure we tell Renderer to render them
        if (forceTeamsRender) patch.teams = this.state.teams;
        
        Renderer.render(patch);
    },

    /* ────────────────────────────────────────────────────
       connect(wsUrl)
       Opens a WebSocket and calls HUD.update() on each
       JSON message.  Auto-reconnects every 3 seconds.
       Message format: any partial HUD.state JSON object.

       Example backend (Python/Node) just sends:
         { "match": { "timer": 42, "spikePlanted": true } }
         { "teams": { "left": { "score": 13 } } }
         { "teams": { "left": { "players": [{ "id": "p1", "hp": 60 }] } } }
         { "observed": { "hp": 75, "k": 18 } }
    ──────────────────────────────────────────────────── */
    connect(wsUrl) {
        let ws;
        const open = () => {
            ws = new WebSocket(wsUrl);
            ws.onmessage = (e) => {
                try { HUD.update(JSON.parse(e.data)); }
                catch (err) { console.warn('[HUD] Bad WS message:', e.data); }
            };
            ws.onerror = () => ws.close();
            ws.onclose = () => setTimeout(open, 3000);
            console.log('[HUD] WebSocket connecting to', wsUrl);
        };
        open();
    },

    /* ────────────────────────────────────────────────────
       poll(url, intervalMs)
       HTTP polling fallback — GET url, expect full or
       partial HUD.state JSON.  Default 500 ms.
    ──────────────────────────────────────────────────── */
    poll(url, intervalMs = 500) {
        const tick = async () => {
            try {
                const res = await fetch(url);
                const data = await res.json();
                HUD.update(data);
            } catch (err) {
                console.warn('[HUD] Poll error:', err);
            }
            setTimeout(tick, intervalMs);
        };
        tick();
    },
};

/* ──────────────────────────────────────────────────────────
   RENDERER
   Each section has its own render method.
   Renderer.render(patch) inspects the patch keys and
   only re-runs the affected sections — fast and surgical.
────────────────────────────────────────────────────────── */
const Renderer = {

    render(patch = HUD.state) {
        if (!patch) return;
        // Always re-render everything on init (no patch keys check)
        const keys = Object.keys(patch);
        if (keys.length === 0 || keys.includes('match'))    this.renderMatch();
        if (keys.length === 0 || keys.includes('teams'))    this.renderTeams();

    },

    /* ── Match: top bar + scoreboard ── */
    renderMatch() {
        const m = HUD.state.match;
        const t = HUD.state.teams;

        // Top bar
        setText('tournament-label', m.tournament);
        setText('tournament-subheading', m.subHeading || '');
        this.renderMaps(m.maps);

        // Timer + round
        setText('round-label', `ROUND ${m.round}`);
        this.renderTimer(m.timer, m.spikePlanted, m.phase, m.spikeDefused);

        // Phase label
        const phaseMap = { buy: 'BUY PHASE', combat: '', end: 'ROUND OVER' };
        setText('phase-label', phaseMap[m.phase] ?? '');

        // Overtime label
        if (m.overtime) {
            setText('phase-label', 'OVERTIME');
        }

        // Spike banner
        toggleClass('spike-banner', 'visible', m.spikePlanted);

        // Spike planted class on center panel to trigger glowing neon red borders
        toggleClass('center-panel', 'spike-planted', m.spikePlanted);
    },

    renderMaps(maps) {
        const strip = document.getElementById('maps-strip');
        if (!strip || !maps) return;
        
        const bestOf = HUD.state.match.bestOf || 3;
        strip.classList.toggle('strip-bo1', bestOf === 1);
        
        // Filter out banned maps
        const playedMaps = maps.filter(m => m.action === 'pick' || m.action === 'decider');
        
        let html = '';
        
        if (bestOf === 1) {
            // BO1: only show 1 map
            const m = playedMaps[0] || { name: 'DECIDER', status: 'current', score: '' };
            const status = m.status || 'current';
            const showScore = m.score && status === 'completed';
            const score = showScore ? `<span class="map-score-badge">${m.score}</span>` : '';
            html = `<div class="map-item ${status}"><span>${m.name}</span>${score}</div>`;
        } else {
            // BO3 or BO5 series
            for (let i = 0; i < bestOf; i++) {
                const isDeciderSlot = (i === bestOf - 1);
                let m = playedMaps[i];
                if (m) {
                    const status = m.status || (isDeciderSlot ? 'decider' : 'upcoming');
                    const showScore = m.score && status === 'completed';
                    const score = showScore ? `<span class="map-score-badge">${m.score}</span>` : '';
                    html += `<div class="map-item ${status}"><span>${m.name}</span>${score}</div>`;
                } else {
                    const label = isDeciderSlot ? 'DECIDER' : `MAP ${i + 1}`;
                    const status = isDeciderSlot ? 'decider' : 'upcoming';
                    html += `<div class="map-item ${status}"><span>${label}</span></div>`;
                }
            }
        }
        
        strip.innerHTML = html;
    },

    renderTimer(seconds, planted, phase, defused) {
        const el = document.getElementById('timer');
        const spikeEl = document.getElementById('spike-icon');
        if (!el || !spikeEl) return;
        
        if (planted) {
            el.classList.add('hide');
            spikeEl.classList.remove('hide');
            if (defused) {
                spikeEl.className = 'spike-icon spike-icon-defused';
            } else {
                spikeEl.className = 'spike-icon spike-icon-blinking';
            }
        } else {
            el.classList.remove('hide');
            spikeEl.classList.add('hide');
            
            let displaySeconds = seconds;
            if (planted && HUD.state.match.spikeDetonationTimer > 0) {
                displaySeconds = HUD.state.match.spikeDetonationTimer;
            }
            const m = Math.floor(displaySeconds / 60);
            const s = displaySeconds % 60;
            el.textContent = `${m}:${String(s).padStart(2, '0')}`;
            el.className = 'timer-display';
            if (displaySeconds <= 10) el.classList.add('critical');
        }
    },

    /* ── Teams: scoreboard + player cards ── */
    renderTeams() {
        const { left, right } = HUD.state.teams;
        this.renderTeamHeader('left',  left);
        this.renderTeamHeader('right', right);
        this.renderPlayerPanel('left',  left);
        this.renderPlayerPanel('right', right);
    },

    renderTeamHeader(side, team) {
        const logoEl = document.getElementById(`logo-${side}`);
        const nameEl = document.getElementById(`name-${side}`);
        const tagEl  = document.getElementById(`tag-${side}`);
        const scoreEl = document.getElementById(`score-${side}`);

        if (logoEl) {
            let logoUrl = team.logoUrl || '';
            let logoPath = '';
            if (logoUrl) {
                if (logoUrl.startsWith('http') || logoUrl.startsWith('/')) {
                    logoPath = logoUrl;
                } else if (logoUrl.includes('assets/team-logo/')) {
                    logoPath = `/${logoUrl}`;
                } else {
                    logoPath = `/assets/team-logo/${logoUrl}`;
                }
            } else {
                logoPath = `https://ui-avatars.com/api/?name=${encodeURIComponent(team.name)}&background=${side === 'left' ? '1a0505' : '001a12'}&color=${side === 'left' ? 'ff4655' : '00d4aa'}&size=64&bold=true`;
            }
            logoEl.src = logoPath;
        }
        setText(`name-${side}`,  team.name);
        setText(`tag-${side}`,   team.tag);
        setText(`score-${side}`, String(team.score));

        // Update accent color based on side for scoreboard and player cards
        const scorePanel = document.getElementById(`scoreboard-panel-${side}`);
        if (scorePanel) {
            scorePanel.style.setProperty('--team-accent',
                team.side === 'attack' ? 'var(--attack)' : 'var(--defense)');
        }
        const cardPanel = document.getElementById(`panel-${side}`);
        if (cardPanel) {
            cardPanel.style.setProperty('--team-accent',
                team.side === 'attack' ? 'var(--attack)' : 'var(--defense)');
        }

        // Pips
        this.renderPips(side, team.roundWins, team.side);
    },

    renderPips(side, wins, teamSide) {
        const el = document.getElementById(`pips-${side}`);
        if (!el) return;
        el.innerHTML = [0, 1, 2, 3].map(i => {
            const winClass = wins[i]
                ? (teamSide === 'attack' ? 'pip win-attack' : 'pip win-defense')
                : 'pip';
            return `<div class="${winClass}"></div>`;
        }).join('');
    },

    renderPlayerPanel(side, team) {
        const panel = document.getElementById(`panel-${side}`);
        if (!panel) return;

        panel.innerHTML = team.players.map(p => this.buildPlayerCard(p, side)).join('');
    },

    buildPlayerCard(p, side) {
        const dead   = p.alive ? '' : 'dead';
        const agentSrc = p.agentImg || agentAvatarUrl(p.agent, 64);
        
        if (side === 'left') {
            return `
<div class="player-card tiny-card side-left ${dead}" id="card-${p.id}" data-player-id="${p.id}">
    <div class="pcard-agent-box">
        <img src="${agentSrc}" alt="${p.agent}" id="agent-img-${p.id}">
    </div>
    <span class="pcard-name" id="pname-${p.id}">${p.name}</span>
</div>`.trim();
        } else {
            // Mirrored Right Side Template
            return `
<div class="player-card tiny-card side-right ${dead}" id="card-${p.id}" data-player-id="${p.id}">
    <span class="pcard-name" id="pname-${p.id}">${p.name}</span>
    <div class="pcard-agent-box">
        <img src="${agentSrc}" alt="${p.agent}" id="agent-img-${p.id}">
    </div>
</div>`.trim();
        }
    },

};

/* ──────────────────────────────────────────────────────────
   SURGICAL DOM UPDATERS
   Called by HUD.update() for per-player live updates
   without rebuilding the whole card.
────────────────────────────────────────────────────────── */

/**
 * Update a single player's HP and HP bar in-place.
 * Efficient — no card rebuild, no layout thrash.
 */
function updatePlayerHP(playerId, newHp) {
    const allPlayers = getAllPlayers();
    const p = allPlayers.find(x => x.id === playerId);
    if (!p) return;

    p.hp = Math.max(0, newHp);
    const cardEl = document.getElementById(`card-${playerId}`);
    if (p.hp === 0 && p.alive) {
        p.alive = false;
        cardEl?.classList.add('dead');
    } else if (p.hp > 0 && !p.alive) {
        p.alive = true;
        cardEl?.classList.remove('dead');
    }
}

/**
 * Update a single player's shield value.
 */
function updatePlayerShield(playerId, newShield) {
    const allPlayers = getAllPlayers();
    const p = allPlayers.find(x => x.id === playerId);
    if (!p) return;

    p.shield = Math.max(0, newShield);
}

    // Removed updatePlayerStats and updatePlayerCredits logic as they are not needed for tiny cards

/* ──────────────────────────────────────────────────────────
   DEEP MERGE UTILITY
   Merges src into target recursively.
   Arrays of players are merged by `id` field.
────────────────────────────────────────────────────────── */
function deepMerge(target, src) {
    if (!src || typeof src !== 'object') return;

    for (const key of Object.keys(src)) {
        const srcVal = src[key];
        const tgtVal = target[key];

        if (Array.isArray(srcVal)) {
            // If array of objects with `id` field → merge by id
            if (Array.isArray(tgtVal) && tgtVal.length && tgtVal[0].id !== undefined) {
                for (const srcItem of srcVal) {
                    const tgtItem = tgtVal.find(x => x.id === srcItem.id);
                    if (tgtItem) deepMerge(tgtItem, srcItem);
                    else tgtVal.push(srcItem);
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

/* ──────────────────────────────────────────────────────────
   HELPERS
────────────────────────────────────────────────────────── */
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? '';
}

function toggleClass(id, cls, condition) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle(cls, !!condition);
}

function getAllPlayers() {
    return [
        ...HUD.state.teams.left.players,
        ...HUD.state.teams.right.players,
    ];
}

/* ──────────────────────────────────────────────────────────
   TIMER ENGINE (client-side countdown)
   Backend should send { "match": { "timer": N } } each
   round to re-sync. Between updates the HUD ticks itself.
────────────────────────────────────────────────────────── */
function startTimer() {
    setInterval(() => {
        const m = HUD.state.match;
        if (m.phase === 'end') return;

        if (m.phase === 'buy') {
            HUD.state.match.timer = Math.max(0, HUD.state.match.timer - 1);
        } else if (m.phase === 'combat') {
            HUD.state.match.timer = Math.max(0, HUD.state.match.timer - 1);
        }

        // Spike detonation countdown
        if (m.spikePlanted && m.spikeDetonationTimer > 0) {
            HUD.state.match.spikeDetonationTimer = Math.max(0, m.spikeDetonationTimer - 1);
        }

        Renderer.renderTimer(
            HUD.state.match.timer,
            HUD.state.match.spikePlanted,
            HUD.state.match.phase,
            HUD.state.match.spikeDefused
        );
    }, 1000);
}

/* ──────────────────────────────────────────────────────────
   BOOT — connect to backend server
────────────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
    // Full initial render with default state
    Renderer.render({});
    startTimer();

    // Auto-connect to backend WebSocket
    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    HUD.connect(`${wsProto}//${location.host}`);
});
