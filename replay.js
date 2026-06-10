// replay.js — VCT-Style Broadcast Replay Overlay Controller
'use strict';

const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProto}//${location.host}`);
let activeState = {};
let prevVisible = null;

// Start the rolling timecode counter immediately
startTimecode();

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
        } else if (srcVal && typeof srcVal === 'object') {
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
            activeState.teams = patch._replaceTeams;
            delete patch._replaceTeams;
        }

        deepMerge(activeState, patch);

        // Toggle visibility active class based on state.replay.visible
        const replayVisible = (activeState.replay && activeState.replay.visible) || false;
        if (replayVisible !== prevVisible) {
            prevVisible = replayVisible;
            updateVisibility(replayVisible);
        }

        const match = activeState.match || {};
        const teams = activeState.teams || {};

        // Update scrolling ticker text dynamically
        const tickerEl = document.getElementById('replay-ticker-text');
        if (tickerEl) {
            const tourney = (match.tournament || 'WarCities://Valorant Pro Series').toUpperCase();
            const stage = match.subHeading ? match.subHeading.toUpperCase() : 'LIVE BROADCAST';
            const leftTeam = (teams.left?.name || 'TEAM A').toUpperCase();
            const rightTeam = (teams.right?.name || 'TEAM B').toUpperCase();
            const combinedText = `✦ ${tourney} // PHASE: ${stage} // MATCH: ${leftTeam} VS ${rightTeam} ✦ ${tourney} // PHASE: ${stage} // MATCH: ${leftTeam} VS ${rightTeam} ✦`;
            if (tickerEl.textContent.trim() !== combinedText.trim()) {
                tickerEl.textContent = combinedText;
            }
        }

        // Update live matchup tags and scores in the replay console
        const leftTagEl = document.getElementById('lbl-left-tag');
        const rightTagEl = document.getElementById('lbl-right-tag');
        const leftScoreEl = document.getElementById('lbl-left-score');
        const rightScoreEl = document.getElementById('lbl-right-score');
        
        if (leftTagEl) leftTagEl.textContent = (teams.left?.tag || 'T1').toUpperCase();
        if (rightTagEl) rightTagEl.textContent = (teams.right?.tag || 'T2').toUpperCase();
        if (leftScoreEl) leftScoreEl.textContent = teams.left?.score ?? 0;
        if (rightScoreEl) rightScoreEl.textContent = teams.right?.score ?? 0;

    } catch (err) {
        console.error('[WS] Error processing message:', err);
    }
};

ws.onopen = () => {
    console.log('[WS] Connected to VCT HUD Server (Replay Overlay)');
};

ws.onclose = () => {
    console.log('[WS] Disconnected from server. Reconnecting in 3s...');
    setTimeout(() => {
        location.reload();
    }, 3000);
};

function updateVisibility(visible) {
    const wrapper = document.getElementById('replay-wrapper');
    if (!wrapper) return;
    
    if (visible) {
        wrapper.classList.add('active');
        console.log('[REPLAY] Overlay Visible (Animate In)');
    } else {
        wrapper.classList.remove('active');
        console.log('[REPLAY] Overlay Hidden (Animate Out)');
    }
}

// Dynamic 60fps running timecode display
let frameCount = 0;
function startTimecode() {
    setInterval(() => {
        frameCount++;
        const frames = String(frameCount % 60).padStart(2, '0');
        const totalSeconds = Math.floor(frameCount / 60);
        const seconds = String(totalSeconds % 60).padStart(2, '0');
        const totalMinutes = Math.floor(totalSeconds / 60);
        const minutes = String(totalMinutes % 60).padStart(2, '0');
        const hours = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
        
        const tcDisplay = document.getElementById('tc-display');
        if (tcDisplay) {
            tcDisplay.textContent = `${hours}:${minutes}:${seconds}:${frames}`;
        }
    }, 1000 / 60);
}
