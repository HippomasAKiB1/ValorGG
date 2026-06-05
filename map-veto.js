// map-veto.js
'use strict';

const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProto}//${location.host}`);
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

function getTeamTag(teamKey) {
    if (!teamKey || teamKey === 'none') return '';
    if (!state.teams) return '';
    return state.teams[teamKey] ? (state.teams[teamKey].tag || state.teams[teamKey].name) : '';
}

function getTeamLogoPath(teamKey) {
    if (!teamKey || teamKey === 'none') return '';
    if (!state.teams) return '';
    const team = state.teams[teamKey];
    if (!team) return '';
    const logoUrl = team.logoUrl || '';
    if (!logoUrl) return '';
    
    if (logoUrl.startsWith('http') || logoUrl.startsWith('/')) {
        return logoUrl;
    } else if (logoUrl.includes('assets/team-logo/')) {
        return `/${logoUrl}`;
    } else {
        return `/assets/team-logo/${logoUrl}`;
    }
}

function renderVeto() {
    if (!state || !state.match || !state.match.maps) return;

    let label = state.match.tournament || '';
    if (state.match.subHeading) {
        label += ' • ' + state.match.subHeading;
    }
    document.getElementById('tournament-label').textContent = label;

    const container = document.getElementById('veto-cards-container');
    container.innerHTML = state.match.maps.map(m => {
        const teamTag = getTeamTag(m.team);
        const logoPath = getTeamLogoPath(m.team);
        let headerText = '';
        
        if (m.action === 'decider') {
            headerText = 'DECIDER';
        } else {
            headerText = teamTag ? `${teamTag.toUpperCase()} ${m.action.toUpperCase()}` : m.action.toUpperCase();
        }

        const stampImg = logoPath ? `<img class="veto-team-stamp" src="${logoPath}" alt="Team Stamp" onerror="this.style.display='none';">` : '';

        return `
            <div class="veto-card action-${m.action} team-${m.team}">
                <div class="veto-card-header">${headerText}</div>
                <div class="veto-card-image">
                    <img src="${getMapImage(m.name)}" alt="${m.name}" onerror="this.src=''">
                    ${stampImg}
                </div>
                <div class="veto-card-footer">${m.name}</div>
            </div>
        `;
    }).join('');
}
