// stats.js — VCT-Style Match Statistics Overlay Controller
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
            matchStats: state.matchStats
        });
        if (renderKey !== prevRenderKey) {
            prevRenderKey = renderKey;
            render();
        }
    } catch (err) {
        console.error('[WS] Error processing message:', err);
    }
};

ws.onopen = () => console.log('[WS] Connected (Match Stats)');
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
    const wrapper = document.getElementById('ms-wrapper');
    if (!wrapper) return;

    const ms = state.matchStats || {};
    const teams = state.teams || {};

    // Visibility
    wrapper.style.display = ms.visible ? 'flex' : 'none';
    if (!ms.visible) return;

    // Header map label
    document.getElementById('ms-map-label').textContent = ms.mapLabel || '';

    // Score bar
    ['left', 'right'].forEach(side => {
        const team = teams[side];
        if (!team) return;
        const logoEl = document.getElementById(`ms-logo-${side}`);
        const logoPath = getLogoPath(team.logoUrl);
        if (logoEl) {
            logoEl.src = logoPath || '';
            logoEl.style.display = logoPath ? 'inline-block' : 'none';
        }
        document.getElementById(`ms-name-${side}`).textContent = team.name || '';
    });

    document.getElementById('ms-final-score').textContent = ms.finalScore || '';

    // Scoreboard frame
    const frameContainer = document.getElementById('ms-frame-content');
    if (ms.scoreboardImage) {
        const img = document.createElement('img');
        img.src = ms.scoreboardImage;
        img.alt = 'Scoreboard';
        img.onerror = function() {
            frameContainer.innerHTML = '<div class="ms-chroma-box"><span class="ms-chroma-label">SCOREBOARD — CHROMA KEY</span></div>';
        };
        frameContainer.innerHTML = '';
        frameContainer.appendChild(img);
    } else {
        frameContainer.innerHTML = '<div class="ms-chroma-box"><span class="ms-chroma-label">SCOREBOARD — CHROMA KEY</span></div>';
    }

    // Bottom info
    const mvpEl = document.getElementById('ms-mvp-note');
    const acsEl = document.getElementById('ms-acs-note');

    if (ms.mvpNote) {
        mvpEl.innerHTML = `<span class="highlight">★</span> ${escapeHtml(ms.mvpNote)}`;
        mvpEl.style.display = 'block';
    } else {
        mvpEl.style.display = 'none';
    }

    if (ms.topAcs) {
        acsEl.innerHTML = escapeHtml(ms.topAcs);
        acsEl.style.display = 'block';
    } else {
        acsEl.style.display = 'none';
    }
}
