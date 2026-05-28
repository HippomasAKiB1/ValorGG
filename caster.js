// caster.js — VCT-Style Full-Screen Caster Desk Controller
'use strict';

const ws = new WebSocket(`ws://${location.host}`);
let prevCastersJson = '';
let prevMatchJson = '';

ws.onmessage = (event) => {
    try {
        const data = JSON.parse(event.data);
        if (!data) return;

        // ── 1. Update Casters (only on change) ──
        const casters = data.casters;
        if (casters !== undefined) {
            const castersJson = JSON.stringify(casters);
            if (castersJson !== prevCastersJson) {
                prevCastersJson = castersJson;
                renderCasters(casters);
            }
        }

        // ── 2. Update Top Banner & Dynamic Ticker ──
        const match = data.match;
        const teams = data.teams;
        const stateKey = JSON.stringify({ match, teams });
        if (stateKey !== prevMatchJson) {
            prevMatchJson = stateKey;
            updateHUDMetadata(data);
        }
    } catch (err) {
        console.error('[WS] Error processing message:', err);
    }
};

ws.onopen = () => {
    console.log('[WS] Connected to VCT HUD Server (Caster Desk full-screen)');
};

ws.onclose = () => {
    console.log('[WS] Disconnected from server. Reconnecting in 3s...');
    setTimeout(() => {
        location.reload();
    }, 3000);
};

// Social Icon SVG (Modern X/Twitter Icon)
const SOCIAL_SVG = `
<svg class="caster-social-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
</svg>
`;

function renderCasters(castersList) {
    const container = document.getElementById('caster-container');
    if (!container) return;

    if (!castersList || castersList.length === 0) {
        container.innerHTML = '';
        return;
    }

    // Limit to maximum 2 casters side-by-side for the broadcast desk layout
    const activeCasters = castersList.slice(0, 2);

    container.innerHTML = activeCasters.map((caster, index) => {
        const name = caster.name || 'Caster';
        const role = caster.role || 'Caster';
        const social = caster.social || '';
        
        // Stagger delay for cascading slide-in animation
        const delay = (index * 0.15).toFixed(2);

        // Portrait Image source selection (scanned assets/caster folder or dynamic UI Avatar)
        const imgUrl = caster.image 
            ? `/assets/caster/${caster.image}` 
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0a0d12&color=e8b84b&size=512&bold=true&font-size=0.3`;

        return `
            <div class="caster-card" style="animation-delay: ${delay}s;">
                <div class="caster-corner-notch"></div>
                <div class="caster-image-frame">
                    <img class="caster-image" src="${imgUrl}" alt="${escapeHtml(name)}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0a0d12&color=e8b84b&size=512&bold=true&font-size=0.3'">
                </div>
                <div class="caster-info">
                    <div class="caster-role">${escapeHtml(role)}</div>
                    <div class="caster-name">${escapeHtml(name)}</div>
                    ${social ? `
                        <div class="caster-social">
                            ${SOCIAL_SVG}
                            <span>${escapeHtml(social)}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
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
            <span>MATCH: ${leftTeam} VS ${rightTeam}</span>
            <span class="dot">•</span>
            <span>ROUND ${roundNum}</span>
            <span class="dot">•</span>
            <span>POWERED BY VALORGG CONTROL PANEL</span>
            <span class="dot">•</span>
            <span>${tourney} LIVE BROADCAST</span>
            <span class="dot">•</span>
            <span>MATCH: ${leftTeam} VS ${rightTeam}</span>
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
