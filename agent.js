// agent.js — VCT-Style Agent Selection Strip
'use strict';

const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProto}//${location.host}`);
let state = null;
let prevLockStates = {};

ws.onmessage = (event) => {
    const patch = JSON.parse(event.data);
    if (patch._replaceTeams) {
        if (state) state.teams = patch._replaceTeams;
    }
    if (!state) {
        state = patch;
        initLockStates();
    } else {
        deepMerge(state, patch);
    }
    render();
};

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

function initLockStates() {
    if (!state || !state.teams) return;
    ['left', 'right'].forEach(side => {
        state.teams[side].players.forEach(p => {
            prevLockStates[p.id] = p.agentLocked || false;
        });
    });
}

function getMapImage(mapName) {
    if (!mapName) return '';
    return `/assets/maps/${mapName.toLowerCase()}.webp`;
}

function getCurrentMap() {
    if (!state || !state.match || !state.match.maps) return null;
    // Find the map currently marked as 'current'
    const current = state.match.maps.find(m => m.status === 'current');
    if (current) return current;

    // Fallback if none is marked 'current'
    const pick = state.match.maps.find(m => m.action === 'pick');
    return pick || state.match.maps[0] || null;
}

function render() {
    if (!state || !state.teams) return;

    // Center VS section
    const currentMap = getCurrentMap();
    if (currentMap) {
        document.getElementById('vs-map-name').textContent = currentMap.name;
        document.getElementById('vs-map-img').src = getMapImage(currentMap.name);
    }

    ['left', 'right'].forEach(side => {
        const team = state.teams[side];
        if (!team) return;

        // Team header
        document.getElementById(`at-name-${side}`).textContent = team.name;
        document.getElementById(`at-side-${side}`).textContent =
            team.side === 'attack' ? 'ATK' : 'DEF';

        // Cards
        const container = document.getElementById(`agent-cards-${side}`);

        team.players.forEach((p, idx) => {
            const cardId = `acard-${p.id}`;
            let card = document.getElementById(cardId);

            if (!card) {
                card = document.createElement('div');
                card.id = cardId;
                card.className = 'agent-card-vct';
                card.innerHTML = `
                    <div class="agent-card-portrait">
                        <img src="" alt="">
                    </div>
                    <div class="agent-card-nameplate">
                        <span class="nameplate-agent"></span>
                        <span class="nameplate-player"></span>
                    </div>
                    <div class="lock-in-badge"><span>LOCKED IN</span></div>
                `;
                container.appendChild(card);
            }

            // Update text
            card.querySelector('.nameplate-player').textContent = p.name;
            card.querySelector('.nameplate-agent').textContent = p.agent || 'SELECTING';

            // Portrait
            const img = card.querySelector('.agent-card-portrait img');
            if (p.agent) {
                const safeName = p.agent.replace('/', '').toLowerCase();
                const agentPath = `/assets/agent/${safeName}.webp`;
                if (img.getAttribute('data-agent') !== p.agent) {
                    img.src = agentPath;
                    img.alt = p.agent;
                    img.setAttribute('data-agent', p.agent);
                }
                if (!card.classList.contains('agent-revealed')) {
                    requestAnimationFrame(() => card.classList.add('agent-revealed'));
                }
            } else {
                img.src = '';
                img.alt = '';
                img.removeAttribute('data-agent');
                card.classList.remove('agent-revealed');
            }

            // Lock-in detection
            const wasLocked = prevLockStates[p.id] || false;
            const isLocked = p.agentLocked || false;

            if (isLocked && !wasLocked) {
                triggerLockIn(card);
            }

            if (isLocked) {
                card.classList.add('agent-locked');
            } else {
                card.classList.remove('agent-locked');
            }

            prevLockStates[p.id] = isLocked;
        });
    });
}

function triggerLockIn(card) {
    const badge = card.querySelector('.lock-in-badge');
    if (!badge) return;

    badge.classList.remove('animate');
    card.classList.remove('flash-lock');
    void badge.offsetWidth;

    badge.classList.add('animate');
    card.classList.add('flash-lock');

    setTimeout(() => {
        badge.classList.remove('animate');
    }, 2000);
}
