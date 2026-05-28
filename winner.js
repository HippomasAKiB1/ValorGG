// winner.js — VCT-Style Match Winner Overlay Controller
'use strict';

const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProto}//${location.host}`);
let prevWinnerJson = '';
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

        // ── 1. Update Match Winner (only on change) ──
        const matchWinner = activeState.matchWinner;
        const teams = activeState.teams;
        const winnerKey = JSON.stringify({ matchWinner, teams });
        
        if (winnerKey !== prevWinnerJson) {
            prevWinnerJson = winnerKey;
            renderWinner(activeState);
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
    console.log('[WS] Connected to VCT HUD Server (Match Winner Overlay)');
};

ws.onclose = () => {
    console.log('[WS] Disconnected from server. Reconnecting in 3s...');
    setTimeout(() => {
        location.reload();
    }, 3000);
};

function renderWinner(state) {
    const container = document.getElementById('winner-container');
    if (!container) return;

    const winnerSide = state.matchWinner?.winner; // 'left' | 'right' or ''
    const teams = state.teams || {};

    if (!winnerSide || !['left', 'right'].includes(winnerSide)) {
        // Fallback state when no winner is chosen yet
        container.innerHTML = `
            <div class="winner-card fallback-card">
                <div class="winner-ribbon">CHAMPIONSHIP STAGE</div>
                <div class="winner-logo-frame">
                    <div style="font-size:42px; font-weight:900; color:var(--gold);">⚔️</div>
                </div>
                <div class="winner-team-name" style="color:var(--gold);">DECIDER IN PROGRESS</div>
                <div class="winner-team-tag">AWAITING VICTORY</div>
            </div>
        `;
        return;
    }

    const team = teams[winnerSide] || {};
    const name = team.name || `TEAM ${winnerSide.toUpperCase()}`;
    const tag = team.tag || 'MATCH WINNER';
    const logoUrl = team.logoUrl || '';
    let logoPath = '';
    if (logoUrl) {
        if (logoUrl.startsWith('http') || logoUrl.startsWith('/')) {
            logoPath = logoUrl;
        } else if (logoUrl.includes('assets/team-logo/')) {
            logoPath = `/${logoUrl}`;
        } else {
            logoPath = `/assets/team-logo/${logoUrl}`;
        }
    }

    const logoHtml = logoPath 
        ? `<img class="winner-logo" src="${logoPath}" alt="${escapeHtml(name)}" onerror="this.style.display='none'; document.getElementById('logo-text-fallback').style.display='block';">`
        : '';
    const fallbackText = `<div id="logo-text-fallback" style="font-size:38px; font-weight:900; color:var(--gold); display:${logoUrl ? 'none' : 'block'};">${escapeHtml(name.substring(0, 3))}</div>`;

    // Resolve the 5 player agent names
    const players = team.players || [];
    let agentsLineupHtml = '';
    
    // We want 5 staggered slots
    for (let i = 0; i < 5; i++) {
        const p = players[i] || {};
        const agentName = p.agent || 'Jett'; // Fallback
        const agentFile = agentName.toLowerCase().replace('/', '').replace(' ', '').replace('-', '') + '.webp';
        const agentPath = `/assets/agent/${agentFile}`;
        const delay = 0.15 * i; // cascading animation delays
        
        agentsLineupHtml += `
            <div class="agent-slot slot-${i + 1}" style="animation-delay: ${delay}s;">
                <img class="agent-art" src="${agentPath}" alt="${escapeHtml(agentName)}" onerror="this.src='/assets/agent/jett.webp';">
            </div>
        `;
    }

    container.innerHTML = `
        <div class="winner-stage">
            <!-- Stage background beams -->
            <div class="winner-stage-beams"></div>
            
            <!-- Giant glowing background team logo -->
            <div class="winner-bg-logo-container animate-bg-logo">
                ${logoHtml}
                ${fallbackText}
            </div>
            
            <!-- Agent lineup (No blur, sharp, balanced alignment) -->
            <div class="winner-agent-lineup">
                ${agentsLineupHtml}
            </div>
            
            <!-- Bottom Branding -->
            <div class="winner-crest-wrapper">
                <div class="winner-team-info animate-info">
                    <div class="winner-team-name">${escapeHtml(name)}</div>
                    <div class="winner-team-tag">${escapeHtml(tag)}</div>
                </div>
            </div>
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
            <span>MATCH CHAMPIONS REVEALED</span>
            <span class="dot">•</span>
            <span>FINAL SCORES: ${leftTeam} [ ${t.left?.score || 0} ] - [ ${t.right?.score || 0} ] ${rightTeam}</span>
            <span class="dot">•</span>
            <span>POWERED BY VALORGG CONTROL PANEL</span>
            <span class="dot">•</span>
            <span>${tourney} LIVE BROADCAST</span>
            <span class="dot">•</span>
            <span>MATCH CHAMPIONS REVEALED</span>
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
