/**
 * ═══════════════════════════════════════════════════════════
 *  VCT BROADCAST HUD — capture.js  (v4 — Scores OCR Only)
 *
 *  Highly optimized: extracts only Left and Right scores.
 *  Uses a single lightweight whitelisted worker.
 * ═══════════════════════════════════════════════════════════
 */
'use strict';

const CaptureEngine = {
    stream: null,
    videoEl: null,
    workers: {},
    scanIntervalId: null,
    intervalMs: 1000,
    isProcessing: false,
    debugMode: false,

    /* ── Top HUD regions (% of 1920×1080) ── */
    topHud: {
        left:  { top: 1.5, left: 42.5, width: 3.5, height: 5.5 },
        right: { top: 1.5, left: 54.5, width: 3.5, height: 5.5 }
    }
};

/* ══════════════════════════════════════════════════════════
   IMAGE PREPROCESSING
 ══════════════════════════════════════════════════════════ */
function cropRegion(vW, vH, leftPct, topPct, widthPct, heightPct) {
    const c = document.createElement('canvas');
    const sX = Math.floor(vW * leftPct / 100);
    const sY = Math.floor(vH * topPct / 100);
    const sW = Math.max(1, Math.floor(vW * widthPct / 100));
    const sH = Math.max(1, Math.floor(vH * heightPct / 100));
    // upscale 3× for better OCR
    c.width = sW * 3;
    c.height = sH * 3;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(CaptureEngine.videoEl, sX, sY, sW, sH, 0, 0, c.width, c.height);
    return { canvas: c, ctx, origW: sW, origH: sH };
}

function binarize(ctx, w, h, threshold, invert) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
        const g = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
        let v = g > threshold ? 255 : 0;
        if (invert) v = 255 - v;
        d[i] = d[i+1] = d[i+2] = v;
    }
    ctx.putImageData(img, 0, 0);
}

/* ══════════════════════════════════════════════════════════
   OCR HELPERS
 ══════════════════════════════════════════════════════════ */
async function ocrCanvas(canvas, workerKey) {
    const worker = CaptureEngine.workers[workerKey];
    if (!worker) return '';
    try {
        const r = await worker.recognize(canvas);
        return (r.data.text || '').trim();
    } catch(e) {
        logConsole(`[OCR] Error in ${workerKey}: ${e.message}`, 'error');
        return '';
    }
}

/* ══════════════════════════════════════════════════════════
   EXTRACTION FUNCTIONS
 ══════════════════════════════════════════════════════════ */
async function extractTopHud(vW, vH) {
    const patch = {};
    const tasks = [];

    // Left score
    tasks.push((async () => {
        const lCrop = cropRegion(vW, vH, CaptureEngine.topHud.left.left, CaptureEngine.topHud.left.top, CaptureEngine.topHud.left.width, CaptureEngine.topHud.left.height);
        binarize(lCrop.ctx, lCrop.canvas.width, lCrop.canvas.height, 160, false);
        updatePreviewCanvas('crop-left', lCrop.canvas);
        const lText = await ocrCanvas(lCrop.canvas, 'kda');
        const lScore = parseInt(lText.replace(/\D/g,''), 10);
        setResText('res-left', isNaN(lScore) ? '--' : lScore);
        if (!isNaN(lScore) && lScore >= 0 && lScore <= 13) {
            if (!patch.teams) patch.teams = {};
            if (!patch.teams.left) patch.teams.left = {};
            patch.teams.left.score = lScore;
        }
    })());

    // Right score
    tasks.push((async () => {
        const rCrop = cropRegion(vW, vH, CaptureEngine.topHud.right.left, CaptureEngine.topHud.right.top, CaptureEngine.topHud.right.width, CaptureEngine.topHud.right.height);
        binarize(rCrop.ctx, rCrop.canvas.width, rCrop.canvas.height, 160, false);
        updatePreviewCanvas('crop-right', rCrop.canvas);
        const rText = await ocrCanvas(rCrop.canvas, 'kda');
        const rScore = parseInt(rText.replace(/\D/g,''), 10);
        setResText('res-right', isNaN(rScore) ? '--' : rScore);
        if (!isNaN(rScore) && rScore >= 0 && rScore <= 13) {
            if (!patch.teams) patch.teams = {};
            if (!patch.teams.right) patch.teams.right = {};
            patch.teams.right.score = rScore;
        }
    })());

    await Promise.allSettled(tasks);
    return patch;
}

/* ══════════════════════════════════════════════════════════
   SCAN LOOP
 ══════════════════════════════════════════════════════════ */
async function scanLoop() {
    if (CaptureEngine.isProcessing || !CaptureEngine.videoEl ||
        CaptureEngine.videoEl.paused || CaptureEngine.videoEl.ended) return;

    CaptureEngine.isProcessing = true;
    const vW = CaptureEngine.videoEl.videoWidth;
    const vH = CaptureEngine.videoEl.videoHeight;
    if (!vW || !vH) { CaptureEngine.isProcessing = false; return; }

    try {
        const patch = await extractTopHud(vW, vH);

        // Push to server
        if (Object.keys(patch).length > 0 && typeof pushUpdate === 'function') {
            await pushUpdate(patch);
            syncAdminFields(patch);
        }
    } catch(e) {
        logConsole(`[ERROR] Scan failed: ${e.message}`, 'error');
    }

    CaptureEngine.isProcessing = false;
}

/* ══════════════════════════════════════════════════════════
   UI HELPERS
 ══════════════════════════════════════════════════════════ */
function updatePreviewCanvas(canvasId, sourceCanvas) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    el.width = sourceCanvas.width;
    el.height = sourceCanvas.height;
    el.getContext('2d').drawImage(sourceCanvas, 0, 0);
}

function setResText(elId, text) {
    const el = document.getElementById(elId);
    if (el) el.textContent = text;
}

function syncAdminFields(patch) {
    try {
        if (patch.teams?.left?.score !== undefined) {
            const el = document.getElementById('f-left-score');
            if (el && document.activeElement !== el) el.value = patch.teams.left.score;
        }
        if (patch.teams?.right?.score !== undefined) {
            const el = document.getElementById('f-right-score');
            if (el && document.activeElement !== el) el.value = patch.teams.right.score;
        }
    } catch(e) { /* ignore */ }
}

/* ══════════════════════════════════════════════════════════
   ROI DRAG CALIBRATION
 ══════════════════════════════════════════════════════════ */
function setupRoiInteractions() {
    const container = document.getElementById('preview-container');
    const allKeys = ['left', 'right'];

    allKeys.forEach(key => {
        const el = document.getElementById(`roi-box-${key}`);
        if (!el) return;

        // Position ROIs from config
        const roi = CaptureEngine.topHud[key];
        el.style.top = `${roi.top}%`;
        el.style.left = `${roi.left}%`;
        el.style.width = `${roi.width}%`;
        el.style.height = `${roi.height}%`;

        // Drag logic
        let dragging = false, startX, startY, startL, startT;

        el.addEventListener('mousedown', e => {
            dragging = true;
            el.classList.add('active');
            startX = e.clientX; startY = e.clientY;
            startL = CaptureEngine.topHud[key].left;
            startT = CaptureEngine.topHud[key].top;
            e.stopPropagation(); e.preventDefault();
        });

        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            const rect = container.getBoundingClientRect();
            const dL = (e.clientX - startX) / rect.width * 100;
            const dT = (e.clientY - startY) / rect.height * 100;

            CaptureEngine.topHud[key].left = Math.max(0, startL + dL);
            CaptureEngine.topHud[key].top = Math.max(0, startT + dT);
            el.style.left = `${CaptureEngine.topHud[key].left}%`;
            el.style.top = `${CaptureEngine.topHud[key].top}%`;
        });

        document.addEventListener('mouseup', () => {
            if (dragging) {
                dragging = false;
                el.classList.remove('active');
                logConsole(`[ROI] Calibrated '${key}' position.`, 'success');
            }
        });
    });
}

/* ══════════════════════════════════════════════════════════
   CONTROLS
 ══════════════════════════════════════════════════════════ */
function updateCaptureInterval(ms) {
    CaptureEngine.intervalMs = parseInt(ms, 10);
    logConsole(`[ENGINE] Scan interval: ${CaptureEngine.intervalMs}ms`, 'info');
    if (CaptureEngine.scanIntervalId) {
        clearInterval(CaptureEngine.scanIntervalId);
        CaptureEngine.scanIntervalId = setInterval(scanLoop, CaptureEngine.intervalMs);
    }
}

async function startCaptureEngine() {
    try {
        logConsole('[ENGINE] Starting capture...', 'info');
        CaptureEngine.stream = await navigator.mediaDevices.getDisplayMedia({
            video: { displaySurface: 'window', frameRate: { ideal: 30 } },
            audio: false
        });

        CaptureEngine.videoEl = document.getElementById('observer-video');
        CaptureEngine.videoEl.srcObject = CaptureEngine.stream;
        CaptureEngine.stream.getVideoTracks()[0].onended = stopCaptureEngine;

        if (Object.keys(CaptureEngine.workers).length === 0) {
            logConsole('[OCR] Initializing Tesseract worker pool...', 'warn');
            document.getElementById('capture-status').textContent = 'Loading OCR Pool...';
            
            const w = await Tesseract.createWorker('eng');
            await w.setParameters({ tessedit_char_whitelist: '0123456789 ' });
            CaptureEngine.workers['kda'] = w;
            logConsole(`[OCR] Worker 'kda' ready.`, 'info');
            
            logConsole('[OCR] Worker pool active.', 'success');
        }

        document.getElementById('capture-dot').className = 'status-dot connected';
        document.getElementById('capture-status').textContent = 'Status: Live Scanning';
        document.getElementById('btn-start-capture').style.display = 'none';
        document.getElementById('btn-stop-capture').style.display = 'inline-block';

        CaptureEngine.scanIntervalId = setInterval(scanLoop, CaptureEngine.intervalMs);
        logConsole(`[ENGINE] Active. Top HUD score extraction every ${CaptureEngine.intervalMs}ms.`, 'success');
    } catch(err) {
        logConsole(`[ERROR] Capture failed: ${err.message}`, 'error');
    }
}

function stopCaptureEngine() {
    if (CaptureEngine.scanIntervalId) {
        clearInterval(CaptureEngine.scanIntervalId);
        CaptureEngine.scanIntervalId = null;
    }
    if (CaptureEngine.stream) {
        CaptureEngine.stream.getTracks().forEach(t => t.stop());
        CaptureEngine.stream = null;
    }
    if (CaptureEngine.videoEl) CaptureEngine.videoEl.srcObject = null;

    document.getElementById('capture-dot').className = 'status-dot';
    document.getElementById('capture-status').textContent = 'Status: Idle';
    document.getElementById('btn-start-capture').style.display = 'inline-block';
    document.getElementById('btn-stop-capture').style.display = 'none';
    logConsole('[ENGINE] Capture stopped.', 'warn');
}

/* ══════════════════════════════════════════════════════════
   CONSOLE
 ══════════════════════════════════════════════════════════ */
function logConsole(msg, type = '') {
    const el = document.getElementById('ocr-logs');
    if (!el) return;
    const div = document.createElement('div');
    if (type) div.className = type;
    div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    el.appendChild(div);
    while (el.children.length > 40) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
}

/* ══════════════════════════════════════════════════════════
   BOOT
 ══════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/api/roi-config');
        if (res.ok) {
            const config = await res.json();
            const allKeys = ['left', 'right'];
            allKeys.forEach(key => {
                if (config[key]) {
                    CaptureEngine.topHud[key] = config[key];
                }
            });
            logConsole('[ENGINE] Custom ROI positions loaded from server defaults.', 'success');
        }
    } catch (e) {
        logConsole('[ENGINE] Failed to fetch ROI defaults. Using static defaults.', 'info');
    }
    setupRoiInteractions();
    logConsole('[ENGINE] Optimized Top HUD OCR Score engine loaded. Ready.', 'success');
});
