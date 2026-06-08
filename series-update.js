// series-update.js — VCT-Style Series Score Update Overlay Controller
'use strict';

const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProto}//${location.host}`);
let state = null;
let prevRenderKey = '';

function deepMerge(target, src) {
    if (!src || typeof src !== 'object') return;
    for (const key of Object.keys(src)) {
        const srcVal = src[key];
        const tgtVal = target[key];
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

ws.onmessage = (event) => {
    try {
        const patch = JSON.parse(event.data);
        if (!patch) return;

        if (patch._replaceTeams) {
            if (state) state.teams = patch._replaceTeams;
            delete patch._replaceTeams;
        }

        if (!state) {
            state = patch;
        } else {
            deepMerge(state, patch);
        }

        const renderKey = JSON.stringify({
            teams: state.teams,
            match: state.match,
            seriesUpdate: state.seriesUpdate
        });
        if (renderKey !== prevRenderKey) {
            prevRenderKey = renderKey;
            render();
        }
    } catch (err) {
        console.error('[WS] Error processing message:', err);
    }
};

ws.onopen = () => console.log('[WS] Connected (Series Update)');
ws.onclose = () => {
    console.warn('[WS] Disconnected. Reconnecting in 3s...');
    setTimeout(() => location.reload(), 3000);
};

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function getLogoPath(logoUrl) {
    if (!logoUrl) return '';
    if (logoUrl.startsWith('http') || logoUrl.startsWith('/')) return logoUrl;
    return `/${logoUrl}`;
}

function render() {
    if (!state) return;
    const wrapper = document.getElementById('su-wrapper');
    if (!wrapper) return;

    const su = state.seriesUpdate || {};
    const m = state.match || {};
    const teams = state.teams || {};

    // Visibility
    wrapper.style.display = su.visible ? 'flex' : 'none';
    if (!su.visible) return;

    // Header subtitle
    const bestOf = m.bestOf || 3;
    const subLine = m.subHeading ? `${m.subHeading} • BO${bestOf}` : `BO${bestOf}`;
    document.getElementById('su-subtitle').textContent = subLine;

    // Completed map label
    document.getElementById('su-map-label').textContent = su.lastCompletedMap || '';

    // Team logos and names
    ['left', 'right'].forEach(side => {
        const team = teams[side];
        if (!team) return;
        const logoEl = document.getElementById(`su-logo-${side}`);
        const logoPath = getLogoPath(team.logoUrl);
        if (logoEl) {
            logoEl.src = logoPath || '';
            logoEl.style.display = logoPath ? 'block' : 'none';
        }
        document.getElementById(`su-name-${side}`).textContent = team.name || '';
    });

    // Series scores
    const scoreLeft = su.seriesScoreLeft || 0;
    const scoreRight = su.seriesScoreRight || 0;

    const leftDigit = document.getElementById('su-score-left');
    const rightDigit = document.getElementById('su-score-right');

    leftDigit.textContent = scoreLeft;
    rightDigit.textContent = scoreRight;

    // Highlight leading team
    leftDigit.classList.toggle('leading', scoreLeft > scoreRight);
    rightDigit.classList.toggle('leading', scoreRight > scoreLeft);

    // Map winner note
    const winnerEl = document.getElementById('su-winner-text');
    if (su.lastMapWinner && su.lastMapScore) {
        const winnerTeam = teams[su.lastMapWinner];
        winnerEl.textContent = `${winnerTeam ? winnerTeam.name : ''} WINS ${su.lastMapScore}`;
        winnerEl.parentElement.style.display = 'block';
    } else {
        winnerEl.parentElement.style.display = 'none';
    }

    // Next map
    const nextMapEl = document.getElementById('su-next-section');
    if (su.nextMapName) {
        document.getElementById('su-next-name').textContent = su.nextMapName;
        nextMapEl.style.display = 'block';
    } else {
        nextMapEl.style.display = 'none';
    }

    // Dynamic ticker
    const tickerEl = document.getElementById('su-ticker');
    if (tickerEl) {
        const leftName = ((teams.left && teams.left.name) || 'TEAM A').toUpperCase();
        const rightName = ((teams.right && teams.right.name) || 'TEAM B').toUpperCase();
        const tourney = (m.tournament || 'VCT PRO SERIES').toUpperCase();
        const tickerText = `${escapeHtml(tourney)} • ${escapeHtml(leftName)} VS ${escapeHtml(rightName)} • SERIES SCORE: ${scoreLeft} - ${scoreRight}`;
        tickerEl.innerHTML = `
            <span>${tickerText}</span>
            <span class="dot">•</span>
            <span>${tickerText}</span>
        `;
    }
}
