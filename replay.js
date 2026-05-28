// replay.js — VCT-Style Broadcast Replay Overlay Controller
'use strict';

const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProto}//${location.host}`);
let activeState = {};
let prevVisible = null;

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

ws.onmessage = (event) => {
    try {
        const patch = JSON.parse(event.data);
        if (!patch) return;

        deepMerge(activeState, patch);

        // Toggle visibility active class based on state.replay.visible
        const replayVisible = (activeState.replay && activeState.replay.visible) || false;
        if (replayVisible !== prevVisible) {
            prevVisible = replayVisible;
            updateVisibility(replayVisible);
        }
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
