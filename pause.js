// pause.js — VCT Broadcast Pause Overlay Controller
'use strict';

const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProto}//${location.host}`);
let activeState = {};
let prevPauseJson = '';

// Standard deep state merge helper
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
        } else if (srcVal && typeof srcVal === 'object' && !Array.isArray(srcVal)) {
            if (!tgtVal || typeof tgtVal !== 'object') target[key] = {};
            deepMerge(target[key], srcVal);
        } else {
            target[key] = srcVal;
        }
    }
}

// WebSocket Event Listeners
ws.onmessage = (event) => {
    try {
        const patch = JSON.parse(event.data);
        if (!patch) return;

        if (patch._replaceTeams) {
            if (activeState) activeState.teams = patch._replaceTeams;
            delete patch._replaceTeams;
        }

        deepMerge(activeState, patch);

        const pause = activeState.pause || { visible: false, type: 'tech', teamSide: 'attack' };
        const pauseKey = JSON.stringify({ pause, teams: activeState.teams });

        if (pauseKey !== prevPauseJson) {
            prevPauseJson = pauseKey;
            renderPauseScreen(pause);
        }
    } catch (err) {
        console.error('[WS] Error processing message:', err);
    }
};

ws.onopen = () => {
    console.log('[WS] Connected to VCT HUD Server (Pause Overlay)');
};

ws.onclose = () => {
    console.log('[WS] Disconnected from server. Reconnecting in 3s...');
    setTimeout(() => {
        location.reload();
    }, 3000);
};

// Main Rendering Router
function renderPauseScreen(pause) {
    const wrapper = document.getElementById('pause-wrapper');
    const band = document.getElementById('pause-band');
    const watermark = document.getElementById('pause-bg-watermark');
    const contentBox = document.getElementById('pause-content-box');

    if (!wrapper || !band || !watermark || !contentBox) return;

    // 1. Toggle Active Entry/Exit Class
    if (pause.visible) {
        wrapper.classList.add('active');
    } else {
        wrapper.classList.remove('active');
    }

    // 2. Set Background Class and Watermarks
    band.className = 'pause-band';
    if (pause.type === 'tech') {
        band.classList.add('type-tech');
        watermark.textContent = 'TECHNICAL PAUSE';
        
        // Render Technical Pause UI
        contentBox.innerHTML = `<div class="tech-title">TECHNICAL PAUSE</div>`;
    } else {
        band.classList.add('type-team');
        watermark.textContent = 'TIMEOUT';

        // 3. Resolve which team has the timeout dynamically based on teamSide ('attack' | 'defense')
        const teams = activeState.teams || {};
        let pausingTeam = null;

        if (teams.left && teams.left.side === pause.teamSide) {
            pausingTeam = teams.left;
        } else if (teams.right && teams.right.side === pause.teamSide) {
            pausingTeam = teams.right;
        }

        // Fallback team info if unresolved
        const team = pausingTeam || { name: 'AWAITING TEAM', logoUrl: '' };
        
        // Resolve logo path gracefully, avoiding double nesting bugs
        let logoPath = '';
        if (team.logoUrl) {
            if (team.logoUrl.startsWith('http') || team.logoUrl.startsWith('/')) {
                logoPath = team.logoUrl;
            } else if (team.logoUrl.includes('assets/team-logo/')) {
                logoPath = `/${team.logoUrl}`;
            } else {
                logoPath = `/assets/team-logo/${team.logoUrl}`;
            }
        }

        const logoHtml = logoPath 
            ? `<div class="team-logo-wrap"><img class="team-logo-img" src="${logoPath}" alt="${escapeHtml(team.name)}" onerror="this.parentNode.style.display='none';"></div>`
            : '';

        contentBox.innerHTML = `
            <div class="timeout-label">TEAM TIMEOUT</div>
            ${logoHtml}
            <div class="team-name">${escapeHtml(team.name)}</div>
        `;
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
