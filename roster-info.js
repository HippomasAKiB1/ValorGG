// roster-info.js — VCT-Style Team Roster Introduction Overlay Controller
'use strict';

const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProto}//${location.host}`);
let state = null;
let prevRenderKey = '';

// Live image lookup from info.json — always has the latest paths
let infoPlayerImgMap = {}; // { "playername_lowercase": "assets/player-image/name.PNG" }

fetch('/api/rosters')
    .then(r => r.json())
    .then(teams => {
        teams.forEach(team => {
            (team.players || []).forEach(p => {
                if (p.name && p.playerImg) {
                    infoPlayerImgMap[p.name.toLowerCase().trim()] = p.playerImg;
                }
            });
        });
        console.log('[Roster] Loaded info.json image map:', Object.keys(infoPlayerImgMap).length, 'players');
        // Re-render if state is already loaded
        if (state) { prevRenderKey = ''; render(); }
    })
    .catch(err => console.warn('[Roster] Could not load info.json:', err));

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
            rosterInfo: state.rosterInfo
        });
        if (renderKey !== prevRenderKey) {
            prevRenderKey = renderKey;
            render();
        }
    } catch (err) {
        console.error('[WS] Error processing message:', err);
    }
};

ws.onopen = () => console.log('[WS] Connected (Roster Info)');
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

function getPlayerImgPath(img) {
    if (!img) return '';
    if (img.startsWith('http') || img.startsWith('/')) return img;
    return `/${img}`;
}

function handleImgError(el, initial) {
    // If the failed image path has a .jpg, .jpeg, or uppercase .PNG/etc. extension,
    // try to load it as a lowercase .png first before giving up.
    const currentSrc = el.src || '';
    if (!el.dataset.triedPng) {
        el.dataset.triedPng = 'true';
        const lowerSrc = currentSrc.toLowerCase();
        if (lowerSrc.endsWith('.jpg') || lowerSrc.endsWith('.jpeg') || lowerSrc.endsWith('.png')) {
            const newSrc = currentSrc.replace(/\.[a-zA-Z]+$/, '.png');
            if (newSrc !== currentSrc) {
                el.src = newSrc;
                return; // Wait for the new src load attempt
            }
        }
    }

    const div = document.createElement('div');
    div.className = 'roster-player-img roster-player-initial';
    div.textContent = initial || '?';
    el.parentNode.replaceChild(div, el);
}

function render() {
    if (!state) return;
    const wrapper = document.getElementById('roster-wrapper');
    if (!wrapper) return;

    const ri = state.rosterInfo || {};
    const m = state.match || {};
    const teams = state.teams || {};

    // Visibility
    wrapper.style.display = ri.visible ? 'flex' : 'none';
    if (!ri.visible) return;

    // Header
    document.getElementById('ri-tournament').textContent = m.tournament || '';
    document.getElementById('ri-subheading').textContent = m.subHeading || '';

    // Bottom text
    document.getElementById('ri-bottom-text').textContent = ri.bottomText || 'MATCH STARTING SOON';

    // Teams
    ['left', 'right'].forEach(side => {
        const team = teams[side];
        if (!team) return;

        const logoEl = document.getElementById(`ri-logo-${side}`);
        const logoPath = getLogoPath(team.logoUrl);
        if (logoEl) {
            logoEl.src = logoPath || '';
            logoEl.style.display = logoPath ? 'block' : 'none';
        }

        document.getElementById(`ri-name-${side}`).textContent = team.name || '';
        document.getElementById(`ri-tag-${side}`).textContent = team.tag || '';

        const container = document.getElementById(`ri-players-${side}`);
        const players = (team.players || []).slice(0, 5);

        container.innerHTML = players.map((p, i) => {
            // Resolve image: info.json lookup (latest) → state value (fallback)
            const infoImg = infoPlayerImgMap[(p.name || '').toLowerCase().trim()] || '';
            const imgPath = getPlayerImgPath(infoImg || p.playerImg);
            const initial = escapeHtml((p.name || '?').charAt(0).toUpperCase());

            const imgHtml = imgPath
                ? `<img class="roster-player-img" src="${imgPath}" alt="${escapeHtml(p.name)}" onerror="handleImgError(this,'${initial}')">`
                : `<div class="roster-player-img roster-player-initial">${initial}</div>`;

            return `
                <div class="roster-player-row" style="animation-delay: ${(0.3 + i * 0.15).toFixed(2)}s;">
                    <span class="roster-player-number">#${i + 1}</span>
                    ${imgHtml}
                    <span class="roster-player-name">${escapeHtml(p.name)}</span>
                </div>
            `;
        }).join('');
    });
}
