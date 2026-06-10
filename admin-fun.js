// admin-fun.js — Fun Overlay Control Script
'use strict';

const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProto}//${location.host}`);

ws.onmessage = (event) => {
    try {
        const data = JSON.parse(event.data);
        if (!data) return;

        // ── 1. Update Indicators Based on overlay2 State ──
        if (data.overlay2 !== undefined) {
            updateIndicators(data.overlay2);
        }

        // ── 2. Update Live Telemetry Preview Panel ──
        if (data.teams !== undefined) {
            updateTelemetryPreview(data.teams);
        }
    } catch (err) {
        console.error('[WS] Error processing message:', err);
    }
};

ws.onopen = () => {
    console.log('[WS] Connected to ValorGG Broadcast Server (Admin Controller)');
    fetchState();
};

ws.onclose = () => {
    console.log('[WS] Connection closed. Reconnecting in 3s...');
    setTimeout(() => {
        location.reload();
    }, 3000);
};

/* ──────────────────────────────────────────────────────────
   DASHBOARD ACTIONS
   ────────────────────────────────────────────────────────── */

// Fetch initial state on load
async function fetchState() {
    try {
        const res = await fetch('/api/state');
        const data = await res.json();
        if (data.overlay2) updateIndicators(data.overlay2);
        if (data.teams) updateTelemetryPreview(data.teams);
    } catch (err) {
        console.error('[API] Failed to fetch initial state:', err);
    }
}

// Update state on server via partial merge endpoint
async function updateOverlay2State(key, value) {
    try {
        const patch = {
            overlay2: {
                [key]: value
            }
        };
        const res = await fetch('/api/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(patch)
        });
        if (!res.ok) console.error('[API] Failed to update state');
    } catch (err) {
        console.error('[API] Error posting update:', err);
    }
}

// Reset all fields to clear board
async function resetOverlayBoard() {
    try {
        const patch = {
            overlay2: {
                writeNames: false,
                writeScores: false,
                writeMaps: false
            }
        };
        const res = await fetch('/api/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(patch)
        });
        if (!res.ok) console.error('[API] Failed to reset overlay');
    } catch (err) {
        console.error('[API] Error posting reset:', err);
    }
}

// Sequence drawings with delays matching handwriting reveal animations
async function drawAllSequential() {
    console.log('[SEQUENCE] Beginning sequential draw timeline...');
    
    // Step 1: Draw Team Names
    await updateOverlay2State('writeNames', true);
    
    // Wait for Names animation to finish (~4.7 seconds)
    setTimeout(async () => {
        // Step 2: Draw Scores
        await updateOverlay2State('writeScores', true);
    }, 4700);
}

/* ──────────────────────────────────────────────────────────
   UI RENDER HELPERS
   ────────────────────────────────────────────────────────── */

function updateIndicators(overlay2) {
    const dotNames = document.getElementById('dot-names');
    const dotScores = document.getElementById('dot-scores');
    
    if (dotNames) {
        if (overlay2.writeNames === true) dotNames.classList.add('active');
        else dotNames.classList.remove('active');
    }
    
    if (dotScores) {
        if (overlay2.writeScores === true) dotScores.classList.add('active');
        else dotScores.classList.remove('active');
    }
}

function updateTelemetryPreview(teams) {
    const lblLeft = document.getElementById('lbl-left-team');
    const lblRight = document.getElementById('lbl-right-team');
    const lblScore = document.getElementById('lbl-score');
    
    const leftName = (teams.left?.name || 'TEAM A').toUpperCase();
    const rightName = (teams.right?.name || 'TEAM B').toUpperCase();
    const leftScore = teams.left?.score ?? 0;
    const rightScore = teams.right?.score ?? 0;
    
    if (lblLeft) lblLeft.textContent = leftName;
    if (lblRight) lblRight.textContent = rightName;
    if (lblScore) lblScore.textContent = `${leftScore} - ${rightScore}`;
}
