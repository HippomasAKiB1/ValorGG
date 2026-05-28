// bracket.js — VCT-Style Custom Tournament Bracket Controller
'use strict';

const ws = new WebSocket(`ws://${location.host}`);
let activeState = {};
let prevBracketJson = '';
let prevMatchJson = '';

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
        } else if (srcVal && typeof srcVal === 'object') {
            if (!tgtVal || typeof tgtVal !== 'object') target[key] = {};
            deepMerge(target[key], srcVal);
        } else {
            target[key] = srcVal;
        }
    }
}

// ── WebSocket Messages ──
ws.onmessage = (event) => {
    try {
        const patch = JSON.parse(event.data);
        if (!patch) return;

        deepMerge(activeState, patch);

        // 1. Sync Bracket Board Visuals (Only on changes)
        const bracket = activeState.bracket;
        if (bracket) {
            const bracketJson = JSON.stringify(bracket);
            if (bracketJson !== prevBracketJson) {
                prevBracketJson = bracketJson;
                renderBracketBoard(bracket);
            }
        }

        // 2. Sync Tournament Title & Metadata Banners
        const match = activeState.match;
        const matchJson = JSON.stringify(match);
        if (matchJson !== prevMatchJson) {
            prevMatchJson = matchJson;
            updateHUDMetadata(activeState);
        }
    } catch (err) {
        console.error('[WS] Error processing message:', err);
    }
};

ws.onopen = () => {
    console.log('[WS] Connected to VCT HUD Server (Custom Bracket Overlay)');
};

ws.onclose = () => {
    console.log('[WS] Disconnected. Reconnecting in 3s...');
    setTimeout(() => location.reload(), 3000);
};

// ── Premium VCT Mock Bracket Fallback Data ──
const MOCK_BRACKET_DATA = {
    participants: [
        { id: 1, name: 'SENTINELS', seed: 1 },
        { id: 2, name: 'GEN.G', seed: 2 },
        { id: 3, name: 'PAPER REX', seed: 3 },
        { id: 4, name: 'FNATIC', seed: 4 },
        { id: 5, name: '100 THIEVES', seed: 5 },
        { id: 6, name: 'TEAM HERETICS', seed: 6 },
        { id: 7, name: 'LEVIATÁN', seed: 7 },
        { id: 8, name: 'G2 ESPORTS', seed: 8 }
    ],
    matches: [
        // Round 1 (Quarterfinals)
        { id: 'm1', round: 1, player1Id: 1, player2Id: 8, scoresCsv: '2-0', winnerId: 1, state: 'complete' },
        { id: 'm2', round: 1, player1Id: 3, player2Id: 5, scoresCsv: '2-1', winnerId: 3, state: 'complete' },
        { id: 'm3', round: 1, player1Id: 4, player2Id: 7, scoresCsv: '1-2', winnerId: 7, state: 'complete' },
        { id: 'm4', round: 1, player1Id: 2, player2Id: 6, scoresCsv: '2-1', winnerId: 2, state: 'complete' },
        
        // Round 2 (Semifinals)
        { id: 'm5', round: 2, player1Id: 1, player2Id: 3, scoresCsv: '2-1', winnerId: 1, state: 'complete' },
        { id: 'm6', round: 2, player1Id: 7, player2Id: 2, scoresCsv: '1-2', winnerId: 2, state: 'complete' },
        
        // Round 3 (Grand Finale)
        { id: 'm7', round: 3, player1Id: 1, player2Id: 2, scoresCsv: '0-0', winnerId: null, state: 'open' }
    ]
};

// ── Bracket Rendering Engine ──
function renderBracketBoard(bracketData) {
    const board = document.getElementById('bracket-board');
    if (!board) return;

    // Resolve active tournament data, falling back to mock details if empty
    const participants = (bracketData.participants && bracketData.participants.length > 0) 
        ? bracketData.participants 
        : MOCK_BRACKET_DATA.participants;
    
    const matches = (bracketData.matches && bracketData.matches.length > 0) 
        ? bracketData.matches 
        : MOCK_BRACKET_DATA.matches;

    // Group matches by round (ignoring negative round losers bracket for streamlined clean looks)
    const roundsMap = {};
    matches.forEach(m => {
        if (m.round > 0) {
            if (!roundsMap[m.round]) roundsMap[m.round] = [];
            roundsMap[m.round].push(m);
        }
    });

    const roundKeys = Object.keys(roundsMap).sort((a, b) => parseInt(a) - parseInt(b));
    
    if (roundKeys.length === 0) {
        board.innerHTML = `
            <div style="width:100%; text-align:center; padding:100px; font-size:24px; color:var(--vct-yellow);">
                Awaiting bracket synchronization from Challonge...
            </div>
        `;
        return;
    }

    // Build the round columns
    board.innerHTML = roundKeys.map((rk, idx) => {
        const roundMatches = roundsMap[rk];
        // Sort matches by play order or index to keep visual structure aligned
        roundMatches.sort((a, b) => (a.suggestedPlayOrder || 0) - (b.suggestedPlayOrder || 0));

        // Resolve Round Title Header
        let roundTitle = `ROUND ${rk}`;
        if (roundKeys.length === 3) {
            // Standard 8-team 3-round playoff names
            if (idx === 0) roundTitle = 'QUARTERFINALS';
            else if (idx === 1) roundTitle = 'SEMIFINALS';
            else if (idx === 2) roundTitle = 'GRAND FINALE';
        } else if (roundKeys.length === 4) {
            // 16-team 4-round playoff names
            if (idx === 0) roundTitle = 'ROUND OF 16';
            else if (idx === 1) roundTitle = 'QUARTERFINALS';
            else if (idx === 2) roundTitle = 'SEMIFINALS';
            else if (idx === 3) roundTitle = 'GRAND FINALE';
        }

        const matchCardsHtml = roundMatches.map(m => {
            const team1 = participants.find(p => p.id === m.player1Id) || { name: 'TBD', seed: '' };
            const team2 = participants.find(p => p.id === m.player2Id) || { name: 'TBD', seed: '' };

            const p1Score = m.scoresCsv ? m.scoresCsv.split('-')[0] : '0';
            const p2Score = m.scoresCsv ? m.scoresCsv.split('-')[1] : '0';

            const isLive = m.state === 'open' || m.state === 'pending' && (m.player1Id && m.player2Id);
            const isComplete = m.state === 'complete';

            // Resolve winners/losers classes
            let p1Class = 'team-row';
            let p2Class = 'team-row';
            if (team1.name === 'TBD') p1Class += ' tbd';
            if (team2.name === 'TBD') p2Class += ' tbd';

            if (isComplete && m.winnerId) {
                if (m.winnerId === m.player1Id) {
                    p1Class += ' winner';
                    p2Class += ' loser';
                } else if (m.winnerId === m.player2Id) {
                    p2Class += ' winner';
                    p1Class += ' loser';
                }
            }

            return `
                <div class="bracket-match ${isLive ? 'live' : ''}" id="match-${m.id}">
                    ${isLive ? '<div class="match-live-badge">LIVE</div>' : ''}
                    <div class="${p1Class}">
                        <span class="team-name">${escapeHtml(team1.name)}</span>
                        <span class="team-score">${p1Score}</span>
                    </div>
                    <div class="match-separator"></div>
                    <div class="${p2Class}">
                        <span class="team-name">${escapeHtml(team2.name)}</span>
                        <span class="team-score">${p2Score}</span>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="bracket-round" data-round="${rk}">
                <div class="round-header">
                    <h2>${roundTitle}</h2>
                </div>
                ${matchCardsHtml}
            </div>
        `;
    }).join('');

    // Trigger SVG path connector calculations after DOM renders
    setTimeout(() => {
        drawSVGConnectors(roundsMap, roundKeys);
    }, 100);
}

// ── Dynamic SVG Orthogonal Bezier Line Generator ──
function drawSVGConnectors(roundsMap, roundKeys) {
    const canvas = document.getElementById('connector-svg-layer');
    if (!canvas) return;

    // Reset old lines
    canvas.querySelectorAll('.connector-path').forEach(el => el.remove());

    const board = document.getElementById('bracket-board');
    if (!board) return;
    const boardRect = board.getBoundingClientRect();

    // Loop through rounds up to the finals to link children
    for (let r = 0; r < roundKeys.length - 1; r++) {
        const sourceRoundKey = roundKeys[r];
        const targetRoundKey = roundKeys[r + 1];

        const sourceMatches = roundsMap[sourceRoundKey];
        const targetMatches = roundsMap[targetRoundKey];

        sourceMatches.forEach((sm, index) => {
            // In a standard single-elimination binary tree, 
            // source match index J connects to target match index Math.floor(J / 2)
            const targetIdx = Math.floor(index / 2);
            const tm = targetMatches[targetIdx];
            if (!tm) return;

            const sourceEl = document.getElementById(`match-${sm.id}`);
            const targetEl = document.getElementById(`match-${tm.id}`);

            if (sourceEl && targetEl) {
                const sourceRect = sourceEl.getBoundingClientRect();
                const targetRect = targetEl.getBoundingClientRect();

                // 1. Output Pin (Right Center of source match card)
                const x1 = sourceRect.right - boardRect.left;
                const y1 = sourceRect.top + sourceRect.height / 2 - boardRect.top;

                // 2. Input Pin (Left Center of target match card)
                const x2 = targetRect.left - boardRect.left;
                const y2 = targetRect.top + targetRect.height / 2 - boardRect.top;

                // 3. Orthogonal Bezier Slanted Path calculations
                const xm = (x1 + x2) / 2;
                const pathD = `M ${x1} ${y1} L ${xm} ${y1} L ${xm} ${y2} L ${x2} ${y2}`;

                // 4. Resolve path active glow
                const isPathActive = sm.state === 'complete' || (sm.state === 'open' && tm.state === 'open');

                // Create SVG path element
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', pathD);
                path.setAttribute('class', `connector-path ${isPathActive ? 'active' : ''}`);
                canvas.appendChild(path);
            }
        });
    }
}

// Recalculate connector paths on window resizing
window.addEventListener('resize', () => {
    if (activeState.bracket) {
        renderBracketBoard(activeState.bracket);
    } else {
        renderBracketBoard(MOCK_BRACKET_DATA);
    }
});

// ── Header & Footer Banner Sync ──
function updateHUDMetadata(fullState) {
    const m = fullState.match || {};
    const header = document.getElementById('header-tournament');
    if (header && m.tournament) {
        header.textContent = m.tournament.toUpperCase();
    }

    const tickerScroll = document.getElementById('ticker-scroll');
    if (tickerScroll) {
        const tourney = (m.tournament || 'VALORANT PRO SERIES').toUpperCase();
        tickerScroll.innerHTML = `
            <span>${tourney} PLAYOFFS ROUND OF 16</span>
            <span class="dot">•</span>
            <span>LIVE TOURNAMENT BRACKET DISPLAY</span>
            <span class="dot">•</span>
            <span>SCORES UPDATED DIRECTLY FROM CHALLONGE</span>
            <span class="dot">•</span>
            <span>POWERED BY VALORGG BROADCAST HUD</span>
            <span class="dot">•</span>
            <span>${tourney} PLAYOFFS ROUND OF 16</span>
            <span class="dot">•</span>
            <span>LIVE TOURNAMENT BRACKET DISPLAY</span>
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

// Boot initial render
setTimeout(() => {
    renderBracketBoard(MOCK_BRACKET_DATA);
}, 200);
