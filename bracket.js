// bracket.js — VCT-Style Custom Tournament Bracket Controller (Unified Double-Elimination)
'use strict';

const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProto}//${location.host}`);
let activeState = {};
let prevBracketJson = '';
let prevMatchJson = '';
let hasLoadedRealData = false;

// Standard deep state merge helper
function deepMerge(target, src) {
    if (!src || typeof src !== 'object') return;
    for (const key of Object.keys(src)) {
        const srcVal = src[key];
        const tgtVal = target[key];
        if (Array.isArray(srcVal)) {
            if (Array.isArray(tgtVal) && tgtVal.length && tgtVal[0] && tgtVal[0].id !== undefined) {
                for (const srcItem of srcVal) {
                    const tgtItem = tgtVal.find(x => x.id == srcItem.id);
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
                if (bracket.matches && bracket.matches.length > 0) {
                    hasLoadedRealData = true;
                }
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
    console.log('[WS] Connected to VCT HUD Server (Unified Bracket Overlay)');
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
        // Upper Bracket (Winners)
        { id: 'm1', round: 1, player1Id: 1, player2Id: 8, scoresCsv: '13-8,13-11', winnerId: 1, state: 'complete', suggestedPlayOrder: 1 },
        { id: 'm2', round: 1, player1Id: 3, player2Id: 5, scoresCsv: '13-5,13-9', winnerId: 3, state: 'complete', suggestedPlayOrder: 2 },
        { id: 'm3', round: 1, player1Id: 4, player2Id: 7, scoresCsv: '13-11,10-13,13-5', winnerId: 4, state: 'complete', suggestedPlayOrder: 3 },
        { id: 'm4', round: 1, player1Id: 2, player2Id: 6, scoresCsv: '13-7,13-6', winnerId: 2, state: 'complete', suggestedPlayOrder: 4 },
        
        { id: 'm5', round: 2, player1Id: 1, player2Id: 3, scoresCsv: '13-10,13-8', winnerId: 1, state: 'complete', suggestedPlayOrder: 5 },
        { id: 'm6', round: 2, player1Id: 4, player2Id: 2, scoresCsv: '13-9,13-11', winnerId: 4, state: 'complete', suggestedPlayOrder: 6 },
        
        { id: 'm7', round: 3, player1Id: 1, player2Id: 4, scoresCsv: '13-11,13-9', winnerId: 1, state: 'complete', suggestedPlayOrder: 7 },
        
        // Lower Bracket (Losers)
        { id: 'm8', round: -1, player1Id: 8, player2Id: 5, scoresCsv: '13-10,13-6', winnerId: 8, state: 'complete', suggestedPlayOrder: 8 },
        { id: 'm9', round: -1, player1Id: 7, player2Id: 6, scoresCsv: '13-5,13-8', winnerId: 7, state: 'complete', suggestedPlayOrder: 9 },
        
        { id: 'm10', round: -2, player1Id: 8, player2Id: 2, scoresCsv: '13-11,13-9', winnerId: 2, state: 'complete', suggestedPlayOrder: 10 },
        { id: 'm11', round: -2, player1Id: 7, player2Id: 3, scoresCsv: '13-6,13-10', winnerId: 3, state: 'complete', suggestedPlayOrder: 11 },
        
        { id: 'm12', round: -3, player1Id: 2, player2Id: 3, scoresCsv: '13-9,13-11', winnerId: 3, state: 'complete', suggestedPlayOrder: 12 },
        { id: 'm13', round: -4, player1Id: 3, player2Id: 4, scoresCsv: '13-11,13-8', winnerId: 4, state: 'complete', suggestedPlayOrder: 13 },
        
        // Grand Finale
        { id: 'm14', round: 4, player1Id: 1, player2Id: 4, scoresCsv: '0-0', winnerId: null, state: 'open', suggestedPlayOrder: 14 }
    ]
};

// Resilient scores parser that handles direct score-dashes or sums multiple sets in Challonge
function parseChallongeScores(scoresCsv) {
    if (!scoresCsv) return { p1: '0', p2: '0' };
    
    const cleaned = scoresCsv.trim();
    if (!cleaned) return { p1: '0', p2: '0' };

    // Check if there are comma-separated sets
    if (cleaned.includes(',')) {
        let p1Wins = 0;
        let p2Wins = 0;
        const sets = cleaned.split(',');
        for (const set of sets) {
            const parts = set.trim().split('-');
            if (parts.length === 2) {
                const s1 = parseInt(parts[0]) || 0;
                const s2 = parseInt(parts[1]) || 0;
                if (s1 > s2) p1Wins++;
                else if (s2 > s1) p2Wins++;
            }
        }
        return { p1: String(p1Wins), p2: String(p2Wins) };
    }
    
    // Single set or simple format (e.g., "2-1")
    const parts = cleaned.split('-');
    if (parts.length === 2) {
        return { p1: parts[0].trim(), p2: parts[1].trim() };
    }
    
    return { p1: '0', p2: '0' };
}

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

    // Reset old SVG lines globally before redraws
    const canvas = document.getElementById('connector-svg-layer');
    if (canvas) {
        canvas.querySelectorAll('.connector-path').forEach(el => el.remove());
    }

    // Find the absolute maximum positive round (Grand Finals)
    const maxRound = matches.length > 0 ? Math.max(...matches.map(m => m.round)) : 0;

    // 1. Group Upper matches (positive rounds)
    const upperRoundsMap = {};
    matches.forEach(m => {
        if (m.round > 0) {
            if (!upperRoundsMap[m.round]) upperRoundsMap[m.round] = [];
            upperRoundsMap[m.round].push(m);
        }
    });
    const rawUpperKeys = Object.keys(upperRoundsMap).sort((a, b) => parseInt(a) - parseInt(b));

    // 2. Group Lower matches (negative rounds)
    const lowerRoundsMap = {};
    matches.forEach(m => {
        if (m.round < 0) {
            if (!lowerRoundsMap[m.round]) lowerRoundsMap[m.round] = [];
            lowerRoundsMap[m.round].push(m);
        }
    });
    const rawLowerKeys = Object.keys(lowerRoundsMap).sort((a, b) => Math.abs(parseInt(a)) - Math.abs(parseInt(b)));

    // 3. Align Winners and Losers Brackets sequentially matching Challonge's native columns
    let upperRoundKeys = [];
    let lowerRoundKeys = [];

    const losersRounds = rawLowerKeys.filter(rk => parseInt(rk) < 0);

    if (losersRounds.length > 0) {
        const minLowerRound = Math.min(...losersRounds.map(Number));
        const totalLowerRounds = Math.abs(minLowerRound);
        const totalCols = Math.max(maxRound, totalLowerRounds);

        for (let i = 1; i <= totalCols; i++) {
            if (i <= maxRound) {
                upperRoundKeys.push(String(i));
            } else {
                upperRoundKeys.push('spacer_u_' + i);
            }

            if (i <= totalLowerRounds) {
                lowerRoundKeys.push(String(-i));
            } else {
                lowerRoundKeys.push('spacer_l_' + i);
            }
        }
    } else {
        // Fallback for Single Elimination (just standard rounds sequential)
        upperRoundKeys = rawUpperKeys.map(String);
        lowerRoundKeys = Array(rawUpperKeys.length).fill('spacer_l');
    }

    // Render helper function for a given rounds map and sorted keys
    function buildColumnsHtml(roundsMap, roundKeys, isUpper) {
        if (roundKeys.length === 0) return '';
        
        return roundKeys.map((rk, idx) => {
            if (String(rk).startsWith('spacer_')) {
                return `
                    <div class="bracket-round spacer-round">
                        <div class="round-header" style="visibility: hidden;">
                            <h2>SPACER</h2>
                        </div>
                        <div class="round-matches-container"></div>
                    </div>
                `;
            }

            const roundMatches = roundsMap[rk];
            roundMatches.sort((a, b) => (a.suggestedPlayOrder || 0) - (b.suggestedPlayOrder || 0));

            let roundTitle = `ROUND ${rk}`;
            const roundNum = parseInt(rk);
            
            if (isUpper) {
                if (roundNum === maxRound) {
                    roundTitle = 'GRAND FINALE';
                } else if (maxRound === 4) { // 8-team DE
                    if (roundNum === 1) roundTitle = 'UPPER ROUND 1';
                    else if (roundNum === 2) roundTitle = 'UPPER SEMIFINALS';
                    else if (roundNum === 3) roundTitle = 'UPPER FINALS';
                } else { // 16-team DE or generic
                    if (roundNum === 1) roundTitle = 'UPPER ROUND 1';
                    else if (roundNum === 2) roundTitle = 'UPPER QUARTERFINALS';
                    else if (roundNum === 3) roundTitle = 'UPPER SEMIFINALS';
                    else if (roundNum === 4) roundTitle = 'UPPER FINALS';
                }
            } else {
                const lowerIdx = Math.abs(roundNum);
                const minLowerRound = Math.min(...Object.keys(roundsMap).map(Number).filter(r => r < 0));
                if (roundNum === minLowerRound) {
                    roundTitle = 'LOWER FINALS';
                } else {
                    roundTitle = `LOWER ROUND ${lowerIdx}`;
                }
            }

            const matchCardsHtml = roundMatches.map(m => {
                const team1 = participants.find(p => p.id == m.player1Id) || { name: 'TBD', seed: '' };
                const team2 = participants.find(p => p.id == m.player2Id) || { name: 'TBD', seed: '' };

                const scores = parseChallongeScores(m.scoresCsv);
                const p1Score = scores.p1;
                const p2Score = scores.p2;

                const isComplete = m.state === 'complete';

                let p1Class = 'team-row';
                let p2Class = 'team-row';
                if (team1.name === 'TBD') p1Class += ' tbd';
                if (team2.name === 'TBD') p2Class += ' tbd';

                if (isComplete && m.winnerId) {
                    if (m.winnerId == m.player1Id) {
                        p1Class += ' winner';
                        p2Class += ' loser';
                    } else if (m.winnerId == m.player2Id) {
                        p2Class += ' winner';
                        p1Class += ' loser';
                    }
                }

                return `
                    <div class="bracket-match" id="match-${m.id}">
                        <div class="${p1Class}">
                            <span class="team-name">${escapeHtml(team1.name)}</span>
                            <span class="team-score">${p1Score}</span>
                        </div>
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
                    <div class="round-matches-container">
                        ${matchCardsHtml}
                    </div>
                </div>
            `;
        }).join('');
    }

    const upperHtml = buildColumnsHtml(upperRoundsMap, upperRoundKeys, true);
    const lowerHtml = buildColumnsHtml(lowerRoundsMap, lowerRoundKeys, false);

    board.innerHTML = `
        <div class="bracket-section upper-section">
            <div class="section-heading">UPPER BRACKET</div>
            <div class="bracket-row" id="upper-row">
                ${upperHtml}
            </div>
        </div>
        <div class="bracket-section lower-section">
            <div class="section-heading">LOWER BRACKET</div>
            <div class="bracket-row" id="lower-row">
                ${lowerHtml}
            </div>
        </div>
    `;

    // Trigger SVG path connector calculations after DOM renders
    setTimeout(() => {
        drawSVGConnectors(upperRoundsMap, rawUpperKeys);
        drawSVGConnectors(lowerRoundsMap, rawLowerKeys);
        drawLowerFinalsToGrandFinalsConnector(matches, maxRound);
    }, 100);
}

// ── Dynamic SVG Orthogonal Bezier Line Generator ──
function drawSVGConnectors(roundsMap, roundKeys) {
    const canvas = document.getElementById('connector-svg-layer');
    if (!canvas) return;

    const board = document.getElementById('bracket-board');
    if (!board) return;
    const boardRect = board.getBoundingClientRect();

    // Loop through rounds up to the finals to link children
    for (let r = 0; r < roundKeys.length - 1; r++) {
        const sourceRoundKey = roundKeys[r];
        const targetRoundKey = roundKeys[r + 1];

        const sourceMatches = roundsMap[sourceRoundKey];
        const targetMatches = roundsMap[targetRoundKey];
        if (!sourceMatches || !targetMatches) continue;

        sourceMatches.forEach((sm, index) => {
            // In a standard single-elimination binary tree, 
            // source match index J connects to target match index Math.floor(J / 2)
            // But if consecutive rounds have the same number of matches, J connects directly to J!
            let targetIdx = Math.floor(index / 2);
            if (sourceMatches.length === targetMatches.length) {
                targetIdx = index;
            } else if (targetMatches.length === 1 && sourceMatches.length === 1) {
                targetIdx = 0;
            }
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
                const isPathActive = sm.state === 'complete';

                // Create SVG path element
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', pathD);
                path.setAttribute('class', `connector-path ${isPathActive ? 'active' : ''}`);
                canvas.appendChild(path);
            }
        });
    }
}

// ── Special Lower Finals to Grand Finals Connector Drawer ──
function drawLowerFinalsToGrandFinalsConnector(matches, maxRound) {
    const canvas = document.getElementById('connector-svg-layer');
    if (!canvas) return;

    const board = document.getElementById('bracket-board');
    if (!board) return;
    const boardRect = board.getBoundingClientRect();

    const minLowerRound = Math.min(...matches.filter(m => m.round < 0).map(m => m.round));
    const lowerFinalsMatch = matches.find(m => m.round === minLowerRound);
    const grandFinalsMatch = matches.find(m => m.round === maxRound);

    if (lowerFinalsMatch && grandFinalsMatch) {
        const lfEl = document.getElementById(`match-${lowerFinalsMatch.id}`);
        const gfEl = document.getElementById(`match-${grandFinalsMatch.id}`);

        if (lfEl && gfEl) {
            const lfRect = lfEl.getBoundingClientRect();
            const gfRect = gfEl.getBoundingClientRect();

            // 1. Output Pin (Right Center of Lower Finals match card)
            const x1 = lfRect.right - boardRect.left;
            const y1 = lfRect.top + lfRect.height / 2 - boardRect.top;

            // 2. Input Pin (Left Center of Grand Finals match card)
            const x2 = gfRect.left - boardRect.left;
            const y2 = gfRect.top + gfRect.height / 2 - boardRect.top;

            // 3. Orthogonal Bezier Slanted Path calculations (go right first by 20px, then up, then left, matching Challonge UI)
            const pathD = `M ${x1} ${y1} L ${x1 + 20} ${y1} L ${x1 + 20} ${y2} L ${x2} ${y2}`;

            // 4. Resolve path active glow
            const isPathActive = lowerFinalsMatch.state === 'complete';

            // Create SVG path element
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', pathD);
            path.setAttribute('class', `connector-path ${isPathActive ? 'active' : ''}`);
            canvas.appendChild(path);
        }
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

// Boot initial render — only fallback to mock if ws hasn't loaded real bracket
setTimeout(() => {
    if (!hasLoadedRealData) {
        renderBracketBoard(MOCK_BRACKET_DATA);
    }
}, 400);
