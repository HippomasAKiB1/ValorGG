// overlay2.js — Fun Handwritten Board Overlay Controller
'use strict';

const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProto}//${location.host}`);

// Tracking visual state to trigger animations once
let isNamesDrawn = false;
let isScoresDrawn = false;

// Store local data values to detect changes
let currentTeams = null;
let currentMatch = null;

ws.onmessage = (event) => {
    try {
        const data = JSON.parse(event.data);
        if (!data) return;

        // Keep local cache of incoming state
        if (data.teams) currentTeams = data.teams;
        if (data.match) currentMatch = data.match;

        const o2 = data.overlay2 || {};

        // ── 1. Check Names Writing State ──
        if (o2.writeNames !== undefined) {
            if (o2.writeNames === true) {
                if (!isNamesDrawn && currentTeams) {
                    triggerWriteNames(currentTeams);
                }
            } else {
                clearNames();
            }
        }

        // ── 2. Check Scores Writing State ──
        if (o2.writeScores !== undefined) {
            if (o2.writeScores === true) {
                if (!isScoresDrawn && currentTeams) {
                    triggerWriteScores(currentTeams);
                }
            } else {
                clearScores();
            }
        }



    } catch (err) {
        console.error('[WS] Error processing message:', err);
    }
};

ws.onopen = () => {
    console.log('[WS] Connected to ValorGG Broadcast Server (Handwritten Overlay2)');
};

ws.onclose = () => {
    console.log('[WS] Disconnected. Reconnecting in 3s...');
    setTimeout(() => {
        location.reload();
    }, 3000);
};

/* ──────────────────────────────────────────────────────────
   ANIMATION CONTROLLERS & SEQUENCERS
   ────────────────────────────────────────────────────────── */

/**
 * Character-by-character handwritten reveal helper with zero-jitter layout
 */
function drawTextHandwritten(element, text, durationPerChar = 120, onComplete = null) {
    // Cancel any running animations on this element
    if (element.animationInterval) {
        clearInterval(element.animationInterval);
    }
    
    element.innerHTML = '';
    
    if (!text) {
        if (onComplete) onComplete();
        return;
    }
    
    // Ensure element is positioned relatively so absolute chalk stick is positioned correctly
    if (getComputedStyle(element).position === 'static') {
        element.style.position = 'relative';
    }
    
    // Pre-render all characters as spans with opacity 0 to maintain absolute layout stability
    const chars = Array.from(text);
    const spans = chars.map(char => {
        const span = document.createElement('span');
        span.className = 'chalk-char';
        if (char === ' ') {
            span.innerHTML = '&nbsp;';
            span.style.whiteSpace = 'pre';
        } else {
            span.textContent = char;
        }
        element.appendChild(span);
        return span;
    });
    
    // Create the active chalk cursor
    const cursor = document.createElement('span');
    cursor.className = 'chalk-stick-active';
    // Match the cursor's sliding transition speed to the drawing pace
    cursor.style.transition = `left ${durationPerChar}ms linear, top ${durationPerChar}ms linear, opacity 0.1s ease`;
    element.appendChild(cursor);
    
    let i = 0;
    
    // Force DOM repaint to ensure bounding rects can be calculated
    void element.offsetWidth;
    
    // Function to position the chalk stick cursor at the current span
    const updateCursorPosition = (span, char) => {
        if (char === ' ' || !char.trim()) {
            cursor.style.opacity = '0';
        } else {
            cursor.style.opacity = '1';
            const rect = span.getBoundingClientRect();
            const parentRect = element.getBoundingClientRect();
            const left = rect.right - parentRect.left;
            const top = rect.top - parentRect.top;
            const height = rect.height;
            
            cursor.style.left = `${left}px`;
            cursor.style.top = `${top + height / 2}px`;
        }
    };
    
    element.animationInterval = setInterval(() => {
        if (i < spans.length) {
            const span = spans[i];
            const char = chars[i];
            
            // Set dynamic animation duration to match pace
            span.style.animationDuration = `${durationPerChar}ms`;
            
            // Add the revealing class to trigger the clip-path drawing animation
            span.classList.add('revealing');
            
            // Immediately position/move the cursor
            updateCursorPosition(span, char);
            
            i++;
        } else {
            clearInterval(element.animationInterval);
            element.animationInterval = null;
            
            // Remove the active chalk stick when complete
            if (cursor.parentNode) {
                cursor.parentNode.removeChild(cursor);
            }
            
            // Mark all spans as fully revealed (removing clip-path to prevent subpixel issues)
            spans.forEach(s => {
                s.classList.remove('revealing');
                s.classList.add('revealed');
            });
            
            if (onComplete) onComplete();
        }
    }, durationPerChar);
}

function triggerWriteNames(teams) {
    isNamesDrawn = true;
    
    const leftEl = document.getElementById('left-team-name');
    const rightEl = document.getElementById('right-team-name');
    
    const leftTag = (teams.left?.tag || 'T1').toUpperCase();
    const rightTag = (teams.right?.tag || 'T2').toUpperCase();
    
    // Step 1: Draw Left Team Tag
    drawTextHandwritten(leftEl, leftTag, 200, () => {
        // Step 2: Once Left completes, draw Right Team Tag
        if (isNamesDrawn) {
            drawTextHandwritten(rightEl, rightTag, 200);
        }
    });
}

function clearNames() {
    isNamesDrawn = false;
    const leftEl = document.getElementById('left-team-name');
    const rightEl = document.getElementById('right-team-name');
    
    if (leftEl) {
        if (leftEl.animationInterval) {
            clearInterval(leftEl.animationInterval);
            leftEl.animationInterval = null;
        }
        leftEl.textContent = '';
    }
    if (rightEl) {
        if (rightEl.animationInterval) {
            clearInterval(rightEl.animationInterval);
            rightEl.animationInterval = null;
        }
        rightEl.textContent = '';
    }
}

function triggerWriteScores(teams) {
    isScoresDrawn = true;
    
    const leftScoreEl = document.getElementById('left-team-score');
    const rightScoreEl = document.getElementById('right-team-score');
    const dividerEl = document.getElementById('score-divider');
    
    const leftScore = String(teams.left?.score ?? 0);
    const rightScore = String(teams.right?.score ?? 0);
    
    // Step 1: Draw Left Score
    drawTextHandwritten(leftScoreEl, leftScore, 300, () => {
        // Step 2: Once Left Score completes, draw Divider
        if (isScoresDrawn) {
            drawTextHandwritten(dividerEl, '-', 250, () => {
                // Step 3: Once Divider completes, draw Right Score
                if (isScoresDrawn) {
                    drawTextHandwritten(rightScoreEl, rightScore, 300);
                }
            });
        }
    });
}

function clearScores() {
    isScoresDrawn = false;
    const leftScoreEl = document.getElementById('left-team-score');
    const rightScoreEl = document.getElementById('right-team-score');
    const dividerEl = document.getElementById('score-divider');
    
    if (leftScoreEl) {
        if (leftScoreEl.animationInterval) {
            clearInterval(leftScoreEl.animationInterval);
            leftScoreEl.animationInterval = null;
        }
        leftScoreEl.textContent = '';
    }
    if (rightScoreEl) {
        if (rightScoreEl.animationInterval) {
            clearInterval(rightScoreEl.animationInterval);
            rightScoreEl.animationInterval = null;
        }
        rightScoreEl.textContent = '';
    }
    if (dividerEl) {
        if (dividerEl.animationInterval) {
            clearInterval(dividerEl.animationInterval);
            dividerEl.animationInterval = null;
        }
        dividerEl.textContent = '';
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
