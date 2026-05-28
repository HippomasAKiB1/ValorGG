// map-veto.js
'use strict';

const ws = new WebSocket(`ws://${location.host}`);
let state = null;

ws.onmessage = (event) => {
    const patch = JSON.parse(event.data);
    if (!state) {
        state = patch;
    } else {
        deepMerge(state, patch);
    }
    renderVeto();
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

function getMapImage(mapName) {
    const name = mapName.toLowerCase();
    return `/assets/maps/${name}.webp`;
}

function getTeamName(teamKey) {
    if (!teamKey || teamKey === 'none') return '';
    return state.teams[teamKey] ? state.teams[teamKey].name : '';
}

function renderVeto() {
    if (!state || !state.match || !state.match.maps) return;

    document.getElementById('tournament-label').textContent = state.match.tournament;

    const container = document.getElementById('veto-cards-container');
    container.innerHTML = state.match.maps.map(m => {
        const teamName = getTeamName(m.team);
        let headerText = '';
        
        if (m.action === 'decider') {
            headerText = 'DECIDER';
        } else {
            const shortName = teamName ? teamName.substring(0, 4) : '';
            headerText = shortName ? `${shortName} ${m.action}` : m.action.toUpperCase();
        }

        return `
            <div class="veto-card action-${m.action} team-${m.team}">
                <div class="veto-card-header">${headerText}</div>
                <div class="veto-card-image">
                    <img src="${getMapImage(m.name)}" alt="${m.name}" onerror="this.src=''">
                </div>
                <div class="veto-card-footer">${m.name}</div>
            </div>
        `;
    }).join('');
}
