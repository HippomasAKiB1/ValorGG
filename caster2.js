// caster2.js — Ultra Premium cybernetic Caster Desk HUD Controller
'use strict';

const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProto}//${location.host}`);

let prevCastersJson = '';
let prevMatchJson = '';

ws.onmessage = (event) => {
    try {
        const data = JSON.parse(event.data);
        if (!data) return;

        // ── 1. Update Casters (only on change to prevent animation glitches) ──
        const casters = data.casters;
        if (casters !== undefined) {
            const castersJson = JSON.stringify(casters);
            if (castersJson !== prevCastersJson) {
                prevCastersJson = castersJson;
                renderCasters(casters);
            }
        }

        // ── 2. Update Top Banner, Side Metadata & Running Tickers ──
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
    console.log('[WS] Connected to ValorGG Broadcast Server (Caster Desk 2)');
};

ws.onclose = () => {
    console.log('[WS] Connection lost. Retrying connection in 3 seconds...');
    setTimeout(() => {
        location.reload();
    }, 3000);
};

// Social Icon SVG (Modern X / Twitter Icon)
const SOCIAL_SVG = `
<svg class="caster-x-logo" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
</svg>
`;

/**
 * Render caster cards with custom high-tech wrappers
 */
function renderCasters(castersList) {
    const container = document.getElementById('caster-container');
    if (!container) return;

    if (!castersList || castersList.length === 0) {
        container.innerHTML = '';
        return;
    }

    // Limit to 2 casters side-by-side for the broadcast desk layout
    const activeCasters = castersList.slice(0, 2);

    container.innerHTML = activeCasters.map((caster, index) => {
        const name = caster.name || 'Caster';
        const role = caster.role || 'Caster';
        const social = caster.social || '';
        
        // Stagger entrance animation
        const delay = (index * 0.20).toFixed(2);

        // Portrait Image source selection (scanned assets/caster folder or dynamic UI Avatar)
        const imgUrl = caster.image 
            ? `/assets/caster/${caster.image}` 
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0a0d12&color=00f3ff&size=512&bold=true&font-size=0.3`;

        return `
            <div class="caster-chassis" style="animation-delay: ${delay}s;">
                <!-- Polygonal Cybernetic Background -->
                <div class="caster-glass-panel"></div>
                <div class="caster-panel-grid"></div>
                
                <!-- Image Port with Laser Scan FX -->
                <div class="caster-frame-viewport">
                    <div class="caster-laser-scanner"></div>
                    <img class="caster-avatar" src="${imgUrl}" alt="${escapeHtml(name)}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0a0d12&color=00f3ff&size=512&bold=true&font-size=0.3'">
                    
                    <!-- Overlay telemetry metrics -->
                    <div class="caster-hud-metrics">
                        <div class="status-pill">
                            <span class="status-led"></span>
                            <span>COMMS_ON</span>
                        </div>
                        <div class="audio-waves-container" title="Live Audio Waveform Simulation">
                            <span class="audio-bar"></span>
                            <span class="audio-bar"></span>
                            <span class="audio-bar"></span>
                            <span class="audio-bar"></span>
                            <span class="audio-bar"></span>
                        </div>
                    </div>
                </div>

                <!-- Text Detail Stack -->
                <div class="caster-details-body">
                    <div class="role-tag-container">
                        <span class="badge-role">${escapeHtml(role)}</span>
                    </div>
                    <h2 class="caster-card-name" id="caster-name-text-${index}" data-name="${escapeHtml(name)}">${escapeHtml(name)}</h2>
                    ${social ? `
                        <div class="caster-card-social">
                            ${SOCIAL_SVG}
                            <span>${escapeHtml(social)}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    // Trigger sci-fi text scramble effect on names after brief delay
    activeCasters.forEach((caster, index) => {
        const nameEl = document.getElementById(`caster-name-text-${index}`);
        if (nameEl) {
            const finalName = nameEl.getAttribute('data-name');
            setTimeout(() => {
                scrambleText(nameEl, finalName);
            }, 300 + (index * 200));
        }
    });
}

/**
 * Sci-Fi Holographic Text Scramble effect
 */
function scrambleText(element, finalString) {
    const chars = 'XYZ!@#$%0189ABCDEF_+=[]{}:;?';
    let frame = 0;
    const queue = [];
    
    for (let i = 0; i < finalString.length; i++) {
        const to = finalString[i];
        // randomize characters scramble range
        const start = Math.floor(Math.random() * 8);
        const end = start + Math.floor(Math.random() * 12) + 6;
        queue.push({ to, start, end, char: '' });
    }
    
    let cancelId;
    function update() {
        let output = '';
        let complete = 0;
        
        for (let i = 0; i < queue.length; i++) {
            let item = queue[i];
            if (frame >= item.end) {
                complete++;
                output += item.to;
            } else if (frame >= item.start) {
                if (!item.char || Math.random() < 0.3) {
                    item.char = chars[Math.floor(Math.random() * chars.length)];
                }
                output += `<span style="color:var(--cyan); text-shadow:0 0 6px var(--cyan);">${item.char}</span>`;
            } else {
                output += '';
            }
        }
        
        element.innerHTML = output;
        
        if (complete === queue.length) {
            element.textContent = finalString;
            cancelAnimationFrame(cancelId);
        } else {
            frame++;
            cancelId = requestAnimationFrame(update);
        }
    }
    update();
}

/**
 * Update HUD labels, Phase badge, and Bottom Marquee scrolling tracks
 */
function updateHUDMetadata(fullState) {
    const m = fullState.match || {};
    const t = fullState.teams || {};

    // 1. Update Tournament Header Name
    const headerTournament = document.getElementById('header-tournament');
    if (headerTournament && m.tournament) {
        headerTournament.textContent = m.subHeading ? `${m.tournament} // ${m.subHeading}` : m.tournament;
    }

    // 3. Compile dynamic loop headlines (Tournament, Prizepool, Matchup, Casters)
    const tickerScroll = document.getElementById('ticker-scroll');
    if (tickerScroll) {
        const tourney = (m.tournament || 'VALORANT PRO SERIES').toUpperCase();
        const stage = (m.subHeading || 'LIVE MATCH').toUpperCase();
        const prizepool = (m.prizepool || '25K BDT').toUpperCase();
        const leftTeam = (t.left?.name || 'TEAM A').toUpperCase();
        const rightTeam = (t.right?.name || 'TEAM B').toUpperCase();
        
        // Compile casters
        const casters = (fullState.casters && fullState.casters.length > 0) 
            ? fullState.casters.map(c => c.name.toUpperCase()).join(' & ') 
            : 'DESK';

        const headlineText = `
            <span>TOURNAMENT: ${tourney} — ${stage}</span>
            <span class="tech-divider">///</span>
            <span>TOTAL PRIZEPOOL: ${prizepool}</span>
            <span class="tech-divider">///</span>
            <span>CURRENT MATCHUP: ${leftTeam} VS ${rightTeam}</span>
            <span class="tech-divider">///</span>
            <span>ON AIR CASTERS: ${casters}</span>
            <span class="tech-divider">///</span>
        `;
        // Duplicate 3 times to guarantee the width is wider than 1920px for seamless loops
        tickerScroll.innerHTML = headlineText + headlineText + headlineText;
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
