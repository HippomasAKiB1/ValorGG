// mvp.js — VCT-Style Match MVP Overlay Controller
'use strict';

const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProto}//${location.host}`);
let prevMvpJson = '';
let prevMatchJson = '';
let activeState = {};

function deepMerge(target, src) {
    if (!src || typeof src !== 'object') return;
    for (const key of Object.keys(src)) {
        const srcVal = src[key];
        const tgtVal = target[key];
        if (Array.isArray(srcVal)) {
            if (Array.isArray(tgtVal) && tgtVal.length && tgtVal[0] && tgtVal[0].id !== undefined) {
                for (const srcItem of srcVal) {
                    const tgtItem = tgtVal.find(x => x.id === srcItem.id);
                    if (tgtItem) deepMerge(tgtItem, srcItem);
                    else tgtVal.push(srcItem);
                }
            } else {
                target[key] = srcVal;
            }
        } else if (srcVal && typeof srcVal === 'object') {
            if (!tgtVal || typeof tgtVal !== 'object') target[key] = {};
            deepMerge(target[key], srcVal);
        } else {
            target[key] = srcVal;
        }
    }
}

ws.onmessage = (event) => {
    try {
        const patch = JSON.parse(event.data);
        if (!patch) return;

        deepMerge(activeState, patch);

        // ── 1. Update MVP (only on change) ──
        const mvp = activeState.mvp;
        const teams = activeState.teams;
        const mvpKey = JSON.stringify({ mvp, teams });
        
        if (mvpKey !== prevMvpJson) {
            prevMvpJson = mvpKey;
            renderMVP(activeState);
        }

        // ── 2. Update Headers & Ticker ──
        const match = activeState.match;
        const stateKey = JSON.stringify({ match, teams });
        if (stateKey !== prevMatchJson) {
            prevMatchJson = stateKey;
            updateHUDMetadata(activeState);
        }
    } catch (err) {
        console.error('[WS] Error processing message:', err);
    }
};

ws.onopen = () => {
    console.log('[WS] Connected to VCT HUD Server (Match MVP Overlay)');
};

ws.onclose = () => {
    console.log('[WS] Disconnected from server. Reconnecting in 3s...');
    setTimeout(() => {
        location.reload();
    }, 3000);
};

function getAgentTheme(agent) {
    if (!agent) return 'theme-fire';
    const a = agent.toLowerCase().trim();
    if (['jett', 'astra', 'neon', 'yoru', 'harbor'].includes(a)) return 'theme-wind'; // Teal/Cyan
    if (['reyna', 'omen', 'clove', 'fade', 'cypher', 'vyse'].includes(a)) return 'theme-shadow'; // Violet/Purple
    if (['viper', 'killjoy', 'gekko', 'deadlock', 'sage'].includes(a)) return 'theme-toxic'; // Green/Lime
    return 'theme-fire'; // Crimson/Orange (Phoenix, Brimstone, Raze, Breach, Sova, Skye, Chamber, Iso, Miks, Tejo, Veto, Waylay)
}

function renderMVP(state) {
    const container = document.getElementById('mvp-container');
    if (!container) return;

    const mvpState = state.mvp || {};
    const teams = state.teams || {};
    const targetPlayerId = mvpState.playerId;

    // Resolve Player IGN, Team, and Agent
    let playerObj = null;
    let teamName = 'VALORANT PRO';
    let teamLogoUrl = '';
    
    if (targetPlayerId) {
        // Search Left Team
        if (teams.left?.players) {
            const found = teams.left.players.find(p => p.id === targetPlayerId);
            if (found) {
                playerObj = found;
                teamName = teams.left.name || 'TEAM LEFT';
                teamLogoUrl = teams.left.logoUrl || '';
            }
        }
        // Search Right Team if not found
        if (!playerObj && teams.right?.players) {
            const found = teams.right.players.find(p => p.id === targetPlayerId);
            if (found) {
                playerObj = found;
                teamName = teams.right.name || 'TEAM RIGHT';
                teamLogoUrl = teams.right.logoUrl || '';
            }
        }
    }

    if (!playerObj) {
        // Render Placeholder if no MVP selected yet
        container.className = `mvp-container theme-fire`;
        container.innerHTML = `
            <div class="mvp-bg-slash animate-slash" style="opacity: 0.08;"></div>
            <div class="mvp-bg-agent-name" style="opacity: 0.01;">VALORANT</div>
            
            <div class="mvp-hero-spotlight placeholder-spotlight">
                <div class="mvp-stage-halo"></div>
                <div class="mvp-backdrop-panel"></div>
                <div class="mvp-placeholder-symbol">👑</div>
                <div class="mvp-badge-container animate-badge">
                    <div class="mvp-badge-role">MATCH MVP</div>
                    <div class="mvp-badge-name">SELECT PLAYER</div>
                    <div class="mvp-badge-agent">AWAITING STATS</div>
                </div>
            </div>
            
            <div class="mvp-dashboard animate-dashboard" style="opacity: 0.5;">
                <div class="mvp-dashboard-header">
                    <div class="mvp-panel-title">STATS REVEAL</div>
                    <div class="mvp-team-badge">MATCH HIGHLIGHTS</div>
                </div>
                <div class="mvp-stats-main">
                    <div class="mvp-stats-ign">DECIDING...</div>
                </div>
                <div class="mvp-unified-kda">
                    <div class="kda-segment"><span class="segment-label">KILLS</span><span class="segment-val">--</span></div>
                    <div class="kda-slash"></div>
                    <div class="kda-segment"><span class="segment-label">DEATHS</span><span class="segment-val">--</span></div>
                    <div class="kda-slash"></div>
                    <div class="kda-segment"><span class="segment-label">ASSISTS</span><span class="segment-val">--</span></div>
                </div>
            </div>
        `;
        return;
    }

    const name = playerObj.name || 'Player';
    const agent = playerObj.agent || 'Jett';
    
    // Parse KDA
    const kdaString = mvpState.kda || '0/0/0';
    const kdaParts = kdaString.split('/');
    const kills = kdaParts[0] || '0';
    const deaths = kdaParts[1] || '0';
    const assists = kdaParts[2] || '0';

    // Resolve transparent agent artwork path
    const agentFile = agent.toLowerCase().replace('/', '').replace(' ', '').replace('-', '').trim() + '.webp';
    const agentPath = `/assets/agent/${agentFile}`;

    // Resolve player photo path if configured by admin, falling back to roster profile image path!
    let playerPhoto = '';
    if (mvpState.image) {
        playerPhoto = `/assets/mvp/${mvpState.image}`;
    } else if (playerObj && playerObj.playerImg) {
        playerPhoto = `/${playerObj.playerImg}`;
    }

    // Resolve path-safe team logo path to avoid double nesting
    let teamLogoPath = '';
    if (teamLogoUrl) {
        if (teamLogoUrl.startsWith('http') || teamLogoUrl.startsWith('/')) {
            teamLogoPath = teamLogoUrl;
        } else if (teamLogoUrl.includes('assets/team-logo/')) {
            teamLogoPath = `/${teamLogoUrl}`;
        } else {
            teamLogoPath = `/assets/team-logo/${teamLogoUrl}`;
        }
    }

    // Apply the agent dynamic theme class to the container
    const themeClass = getAgentTheme(agent);
    container.className = `mvp-container ${themeClass}`;

    container.innerHTML = `
        <!-- Background Agent Accent text & Slash -->
        <div class="mvp-bg-slash animate-slash"></div>
        <div class="mvp-bg-agent-name">${escapeHtml(agent.toUpperCase())}</div>
        
        <!-- Left Side: 3D Breakout Stage (Agent Spotlight) -->
        <div class="mvp-hero-spotlight">
            <div class="mvp-stage-halo"></div>
            <div class="mvp-backdrop-panel"></div>
            
            <!-- Agent stands proudly on center-stage -->
            <img class="mvp-agent-portrait animate-agent opaque" src="${agentPath}" alt="${escapeHtml(agent)}" onerror="this.src='/assets/agent/jett.webp';">
            
            <div class="mvp-badge-container animate-badge">
                <div class="mvp-badge-role">MATCH MVP</div>
                <div class="mvp-badge-name">${escapeHtml(name)}</div>
                <div class="mvp-badge-agent">${escapeHtml(agent.toUpperCase())}</div>
            </div>
        </div>

        <!-- Right Side: Esports Angled Dashboard -->
        <div class="mvp-dashboard animate-dashboard">
            <div class="mvp-dashboard-header">
                <div class="mvp-panel-title">MATCH MVP</div>
                <div class="mvp-team-badge">
                    ${teamLogoPath ? `<img class="mvp-team-logo" src="${teamLogoPath}" alt="${escapeHtml(teamName)}" onerror="this.style.display='none';">` : ''}
                    <span>${escapeHtml(teamName)}</span>
                </div>
            </div>
            
            <!-- Stats IGN & Framed Player Portrait side-by-side -->
            <div class="mvp-stats-main">
                <div class="mvp-stats-ign">${escapeHtml(name)}</div>
                ${playerPhoto ? `
                    <div class="mvp-player-frame animate-player">
                        <img class="mvp-player-photo-right" src="${playerPhoto}" alt="${escapeHtml(name)}" onerror="this.parentNode.style.display='none';">
                    </div>
                ` : ''}
            </div>
            
            <!-- Unified KDA Bar with Angled Splits -->
            <div class="mvp-unified-kda">
                <div class="kda-segment">
                    <span class="segment-label">KILLS</span>
                    <span class="segment-val">${escapeHtml(kills)}</span>
                </div>
                <div class="kda-slash"></div>
                <div class="kda-segment">
                    <span class="segment-label">DEATHS</span>
                    <span class="segment-val">${escapeHtml(deaths)}</span>
                </div>
                <div class="kda-slash"></div>
                <div class="kda-segment">
                    <span class="segment-label">ASSISTS</span>
                    <span class="segment-val">${escapeHtml(assists)}</span>
                </div>
            </div>
            
            ${mvpState.customNote ? `
                <div class="mvp-custom-note-chevron">
                    <div class="chevron-accent"></div>
                    <div class="chevron-content">${escapeHtml(mvpState.customNote)}</div>
                </div>
            ` : ''}
        </div>
    `;
}

function updateHUDMetadata(fullState) {
    const m = fullState.match || {};
    const t = fullState.teams || {};

    // 1. Update Tournament Header Name
    const headerTournament = document.getElementById('header-tournament');
    if (headerTournament && m.tournament) {
        headerTournament.textContent = m.tournament;
    }

    // 2. Update Ticker Text Dynamically
    const tickerScroll = document.getElementById('ticker-scroll');
    if (tickerScroll) {
        const tourney = (m.tournament || 'VALORANT CHAMPIONS').toUpperCase();
        const roundNum = m.round || 1;
        const leftTeam = (t.left?.name || 'TEAM LEFT').toUpperCase();
        const rightTeam = (t.right?.name || 'TEAM RIGHT').toUpperCase();

        const tickerText = `
            <span>${tourney} LIVE BROADCAST</span>
            <span class="dot">•</span>
            <span>MATCH MVP ANNOUNCED</span>
            <span class="dot">•</span>
            <span>DOMINATING PERFORMANCE SHOWN IN MATCH</span>
            <span class="dot">•</span>
            <span>POWERED BY VALORGG CONTROL PANEL</span>
            <span class="dot">•</span>
            <span>${tourney} LIVE BROADCAST</span>
            <span class="dot">•</span>
            <span>MATCH MVP ANNOUNCED</span>
        `;
        tickerScroll.innerHTML = tickerText;
    }
}

// Simple HTML escaping helper for security
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
