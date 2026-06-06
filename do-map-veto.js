// do-map-veto.js — Interactive Veto State Machine & Integration
'use strict';

let rostersList = [];
let mapPool = []; // Loaded dynamically from /api/maps

// Simulator State
let state = {
    format: 3, // default BO3
    teamA: null,
    teamB: null,
    currentStepIndex: 0,
    vetoSteps: [],
    history: [],
    selectedMapSides: {}, // { [mapName]: { defense: 'Team A' | 'Team B', attack: 'Team A' | 'Team B', pickedBy: 'Team A' | 'Team B' | 'decider' } }
    mapStates: {} // { [mapName]: { action: 'ban' | 'pick' | 'decider', actor: 'Team A' | 'Team B' | null } }
};

// Start initialization
window.addEventListener('DOMContentLoaded', async () => {
    await loadInitialData();
    recoverSavedVetoDraft();
});

// Load teams list and map pool
async function loadInitialData() {
    try {
        const rosterRes = await fetch('/api/rosters');
        rostersList = await rosterRes.json();
        
        const mapRes = await fetch('/api/maps');
        mapPool = await mapRes.json();
        
        populateSetupSelectors();
    } catch (e) {
        console.error('Error loading initial data:', e);
    }
}

// Populate Roster Dropdowns
function populateSetupSelectors() {
    const selectA = document.getElementById('f-veto-teama');
    const selectB = document.getElementById('f-veto-teamb');
    if (!selectA || !selectB) return;

    let options = '<option value="">-- Select Team --</option>';
    rostersList.forEach(t => {
        options += `<option value="${t.name}">${t.name} (${t.tag || 'No Tag'})</option>`;
    });
    
    selectA.innerHTML = options;
    selectB.innerHTML = options;
}

// ── Veto Step Sequencer Definition ──
function generateVetoSteps(format) {
    const steps = [];
    if (format === 1) {
        // BO1 Flow: 6 Alternating bans, Decider, Side choice on Decider
        steps.push({ type: 'ban', actor: 'Team A' });
        steps.push({ type: 'ban', actor: 'Team B' });
        steps.push({ type: 'ban', actor: 'Team A' });
        steps.push({ type: 'ban', actor: 'Team B' });
        steps.push({ type: 'ban', actor: 'Team A' });
        steps.push({ type: 'ban', actor: 'Team B' });
        steps.push({ type: 'decider', actor: null });
        steps.push({ type: 'side', actor: 'Team A' }); // Team A chooses starting side on decider
    } else if (format === 3) {
        // BO3 Flow: Ban A, Ban B, Pick A, Side B (Map 1), Pick B, Side A (Map 2), Ban A, Ban B, Decider, Side A (Map 3)
        steps.push({ type: 'ban', actor: 'Team A' });
        steps.push({ type: 'ban', actor: 'Team B' });
        
        steps.push({ type: 'pick', actor: 'Team A' });
        steps.push({ type: 'side', actor: 'Team B' }); // side decider on Map 1
        
        steps.push({ type: 'pick', actor: 'Team B' });
        steps.push({ type: 'side', actor: 'Team A' }); // side decider on Map 2
        
        steps.push({ type: 'ban', actor: 'Team A' });
        steps.push({ type: 'ban', actor: 'Team B' });
        steps.push({ type: 'decider', actor: null });
        steps.push({ type: 'side', actor: 'Team A' }); // side decider on Map 3
    } else if (format === 5) {
        // BO5 Flow: Ban A, Ban B, Pick A, Side B (Map 1), Pick B, Side A (Map 2), Pick A, Side B (Map 3), Pick B, Side A (Map 4), Decider, Side A (Map 5)
        steps.push({ type: 'ban', actor: 'Team A' });
        steps.push({ type: 'ban', actor: 'Team B' });
        
        steps.push({ type: 'pick', actor: 'Team A' });
        steps.push({ type: 'side', actor: 'Team B' });
        
        steps.push({ type: 'pick', actor: 'Team B' });
        steps.push({ type: 'side', actor: 'Team A' });
        
        steps.push({ type: 'pick', actor: 'Team A' });
        steps.push({ type: 'side', actor: 'Team B' });
        
        steps.push({ type: 'pick', actor: 'Team B' });
        steps.push({ type: 'side', actor: 'Team A' });
        
        steps.push({ type: 'decider', actor: null });
        steps.push({ type: 'side', actor: 'Team A' });
    }
    return steps;
}

// Start Veto Simulation
function startVetoSimulation() {
    const formatSelect = document.getElementById('f-veto-format');
    const teamAVal = document.getElementById('f-veto-teama').value;
    const teamBVal = document.getElementById('f-veto-teamb').value;

    if (!teamAVal || !teamBVal) {
        alert('Please select two teams to start the veto.');
        return;
    }
    if (teamAVal === teamBVal) {
        alert('Teams must be different.');
        return;
    }

    const teamAObj = rostersList.find(t => t.name === teamAVal);
    const teamBObj = rostersList.find(t => t.name === teamBVal);

    state.format = parseInt(formatSelect.value);
    state.teamA = teamAObj;
    state.teamB = teamBObj;
    state.currentStepIndex = 0;
    state.vetoSteps = generateVetoSteps(state.format);
    state.history = [];
    state.selectedMapSides = {};
    state.mapStates = {};

    // transition views
    document.getElementById('setup-panel').classList.remove('active');
    document.getElementById('simulation-workspace').classList.add('active');

    nextStep();
}

// Save draft state to localStorage
function saveVetoDraft() {
    localStorage.setItem('valorgg_veto_draft', JSON.stringify(state));
}

// Recover draft state from localStorage
function recoverSavedVetoDraft() {
    const saved = localStorage.getItem('valorgg_veto_draft');
    if (!saved) return;
    try {
        const parsed = JSON.parse(saved);
        if (parsed.teamA && parsed.teamB && parsed.vetoSteps && parsed.vetoSteps.length > 0) {
            state = parsed;
            
            // transition views
            document.getElementById('setup-panel').classList.remove('active');
            document.getElementById('simulation-workspace').classList.add('active');
            
            // continue step logic
            renderTimeline();
            nextStep();
        }
    } catch(e) {
        console.error('Error recovering veto draft:', e);
        localStorage.removeItem('valorgg_veto_draft');
    }
}

// Discard draft and reset
function resetVetoSimulation(confirmPrompt = true) {
    if (confirmPrompt && !confirm('Are you sure you want to discard this veto process?')) return;
    
    localStorage.removeItem('valorgg_veto_draft');
    
    state.teamA = null;
    state.teamB = null;
    state.history = [];
    state.selectedMapSides = {};
    state.mapStates = {};
    state.currentStepIndex = 0;

    // transition views
    document.getElementById('simulation-workspace').classList.remove('active');
    document.getElementById('confirmation-panel').classList.remove('active');
    document.getElementById('setup-panel').classList.add('active');
    
    populateSetupSelectors();
}

// Process turn and decide UI
function nextStep() {
    saveVetoDraft();

    if (state.currentStepIndex >= state.vetoSteps.length) {
        showConfirmationSummary();
        return;
    }

    const step = state.vetoSteps[state.currentStepIndex];

    // Handle auto decider map detection
    if (step.type === 'decider') {
        const remainingMaps = mapPool.filter(m => !state.mapStates[m] || state.mapStates[m].action === null);
        if (remainingMaps.length > 0) {
            const deciderMapName = remainingMaps[0];
            state.mapStates[deciderMapName] = { action: 'decider', actor: null };
            state.selectedMapSides[deciderMapName] = { pickedBy: 'decider' };
            state.history.push({
                type: 'decider',
                actor: null,
                mapName: deciderMapName,
                detail: `Remaining map became ${deciderMapName} (Decider)`
            });
            renderTimeline();
        }
        state.currentStepIndex++;
        nextStep();
        return;
    }

    // Toggle Side Selection panel vs Interactive Map Card Grid clicks
    const sideSelectionEl = document.getElementById('side-selection-panel');
    if (step.type === 'side') {
        sideSelectionEl.classList.add('active');
        
        // Resolve target map for this side choice
        const targetMap = getTargetMapForStep(state.currentStepIndex);
        const choosingTeam = step.actor === 'Team A' ? state.teamA.name : state.teamB.name;
        
        document.getElementById('side-choice-desc').textContent = `${choosingTeam}, choose Attack or Defense starting side for ${targetMap}`;
        document.getElementById('current-team-indicator').textContent = choosingTeam;
        document.getElementById('current-action-instruction').textContent = `is selecting starting side on ${targetMap}`;
    } else {
        sideSelectionEl.classList.remove('active');
        const choosingTeam = step.actor === 'Team A' ? state.teamA.name : state.teamB.name;
        document.getElementById('current-team-indicator').textContent = choosingTeam;
        document.getElementById('current-action-instruction').textContent = `is selecting a map to ${step.type.toUpperCase()}`;
    }

    renderMapPoolGrid();
}

// Get the map target for a side selection step
function getTargetMapForStep(stepIndex) {
    if (state.format === 1) {
        // BO1 side selection at step 7
        return Object.keys(state.mapStates).find(k => state.mapStates[k].action === 'decider');
    } else if (state.format === 3) {
        // BO3 side selections: Step 3 (Map 1), Step 5 (Map 2), Step 9 (Decider Map 3)
        if (stepIndex === 3) return Object.keys(state.mapStates).find(k => state.mapStates[k].action === 'pick' && state.mapStates[k].actor === 'Team A');
        if (stepIndex === 5) return Object.keys(state.mapStates).find(k => state.mapStates[k].action === 'pick' && state.mapStates[k].actor === 'Team B');
        if (stepIndex === 9) return Object.keys(state.mapStates).find(k => state.mapStates[k].action === 'decider');
    } else if (state.format === 5) {
        // BO5 side selections
        if (stepIndex === 3) {
            const picks = Object.keys(state.mapStates).filter(k => state.mapStates[k].action === 'pick' && state.mapStates[k].actor === 'Team A');
            return picks[0];
        }
        if (stepIndex === 5) {
            const picks = Object.keys(state.mapStates).filter(k => state.mapStates[k].action === 'pick' && state.mapStates[k].actor === 'Team B');
            return picks[0];
        }
        if (stepIndex === 7) {
            const picks = Object.keys(state.mapStates).filter(k => state.mapStates[k].action === 'pick' && state.mapStates[k].actor === 'Team A');
            return picks[1];
        }
        if (stepIndex === 9) {
            const picks = Object.keys(state.mapStates).filter(k => state.mapStates[k].action === 'pick' && state.mapStates[k].actor === 'Team B');
            return picks[1];
        }
        if (stepIndex === 11) return Object.keys(state.mapStates).find(k => state.mapStates[k].action === 'decider');
    }
    return '';
}

// Side choice button click
function selectSideChoice(sideSelected) {
    const step = state.vetoSteps[state.currentStepIndex];
    if (step.type !== 'side') return;

    const targetMap = getTargetMapForStep(state.currentStepIndex);
    const actorName = step.actor === 'Team A' ? state.teamA.name : state.teamB.name;
    const nonActorName = step.actor === 'Team A' ? state.teamB.name : state.teamA.name;

    if (sideSelected === 'defense') {
        state.selectedMapSides[targetMap].defense = step.actor;
        state.selectedMapSides[targetMap].attack = step.actor === 'Team A' ? 'Team B' : 'Team A';
        state.history.push({
            type: 'side',
            actor: step.actor,
            mapName: targetMap,
            detail: `${actorName} selected Defense on ${targetMap} (${nonActorName} starts on Attack)`
        });
    } else {
        state.selectedMapSides[targetMap].attack = step.actor;
        state.selectedMapSides[targetMap].defense = step.actor === 'Team A' ? 'Team B' : 'Team A';
        state.history.push({
            type: 'side',
            actor: step.actor,
            mapName: targetMap,
            detail: `${actorName} selected Attack on ${targetMap} (${nonActorName} starts on Defense)`
        });
    }

    renderTimeline();
    state.currentStepIndex++;
    nextStep();
}

// Map Card selection click
function handleMapCardClick(mapName) {
    const step = state.vetoSteps[state.currentStepIndex];
    if (!step || (step.type !== 'ban' && step.type !== 'pick')) return;

    // verify map is unselected
    if (state.mapStates[mapName]) return;

    const actorName = step.actor === 'Team A' ? state.teamA.name : state.teamB.name;

    if (step.type === 'ban') {
        state.mapStates[mapName] = { action: 'ban', actor: step.actor };
        state.history.push({
            type: 'ban',
            actor: step.actor,
            mapName: mapName,
            detail: `${actorName} banned ${mapName}`
        });
    } else {
        state.mapStates[mapName] = { action: 'pick', actor: step.actor };
        state.selectedMapSides[mapName] = { pickedBy: step.actor };
        state.history.push({
            type: 'pick',
            actor: step.actor,
            mapName: mapName,
            detail: `${actorName} picked ${mapName}`
        });
    }

    renderTimeline();
    state.currentStepIndex++;
    nextStep();
}

// Render Veto logs list
function renderTimeline() {
    const el = document.getElementById('timeline-logs');
    if (!el) return;

    el.innerHTML = state.history.map((log, idx) => {
        return `
            <div class="timeline-item log-${log.type}">
                <span class="timeline-item-number">ACTION #${idx + 1}</span>
                <span class="timeline-item-text">${log.detail}</span>
            </div>
        `;
    }).join('');
    
    // Auto Scroll to bottom
    el.scrollTop = el.scrollHeight;
}

// Render map cards grid
function renderMapPoolGrid() {
    const grid = document.getElementById('map-pool-grid');
    if (!grid) return;

    grid.innerHTML = mapPool.map(mapName => {
        const mState = state.mapStates[mapName];
        let cardClass = 'sim-map-card';
        let overlayHtml = '';

        if (mState) {
            cardClass += ` state-${mState.action}`;
            
            // Draw starting side assignments tags on active card
            const sides = state.selectedMapSides[mapName];
            if (sides && sides.defense && sides.attack) {
                const defTeamName = sides.defense === 'Team A' ? state.teamA.name : state.teamB.name;
                const atkTeamName = sides.attack === 'Team A' ? state.teamA.name : state.teamB.name;
                overlayHtml = `
                    <div class="sim-map-info-overlay">
                        <div class="sim-map-info-row">
                            <span class="sim-side-tag-def">DEF</span>
                            <span class="sim-info-team-name">${defTeamName}</span>
                        </div>
                        <div class="sim-map-info-row">
                            <span class="sim-side-tag-atk">ATK</span>
                            <span class="sim-info-team-name">${atkTeamName}</span>
                        </div>
                    </div>
                `;
            }
        }

        const mapImgUrl = `/assets/maps/${mapName.toLowerCase()}.webp`;

        return `
            <div class="${cardClass}" onclick="handleMapCardClick('${mapName}')">
                <div class="sim-map-image">
                    <img src="${mapImgUrl}" alt="${mapName}" onerror="this.src=''">
                    ${overlayHtml}
                </div>
                <div class="sim-map-footer">${mapName}</div>
            </div>
        `;
    }).join('');
}

// Renders the Summary Page recap
function showConfirmationSummary() {
    document.getElementById('simulation-workspace').classList.remove('active');
    document.getElementById('confirmation-panel').classList.add('active');

    document.getElementById('summary-teama-name').textContent = state.teamA.name;
    document.getElementById('summary-teamb-name').textContent = state.teamB.name;

    // Timeline Summary
    const list = document.getElementById('summary-timeline-list');
    list.innerHTML = state.history.map(log => `<li>${log.detail}</li>`).join('');

    // Maps summaries list
    const strip = document.getElementById('summary-maps-strip');
    const playedMaps = Object.keys(state.mapStates).filter(k => state.mapStates[k].action === 'pick' || state.mapStates[k].action === 'decider');
    
    // Sort so picks and deciders are in order of played matches
    playedMaps.sort((x, y) => {
        const idxX = state.history.findIndex(h => h.mapName === x && (h.type === 'pick' || h.type === 'decider'));
        const idxY = state.history.findIndex(h => h.mapName === y && (h.type === 'pick' || h.type === 'decider'));
        return idxX - idxY;
    });

    strip.innerHTML = playedMaps.map((mapName, idx) => {
        const mState = state.mapStates[mapName];
        const sides = state.selectedMapSides[mapName];
        let infoRowHtml = '';
        if (sides && sides.defense && sides.attack) {
            const defName = sides.defense === 'Team A' ? state.teamA.name : state.teamB.name;
            const atkName = sides.attack === 'Team A' ? state.teamA.name : state.teamB.name;
            infoRowHtml = `
                <div class="sim-map-info-overlay">
                    <div class="sim-map-info-row">
                        <span class="sim-side-tag-def">DEF</span>
                        <span class="sim-info-team-name">${defName}</span>
                    </div>
                    <div class="sim-map-info-row">
                        <span class="sim-side-tag-atk">ATK</span>
                        <span class="sim-info-team-name">${atkName}</span>
                    </div>
                </div>
            `;
        }

        const mapImgUrl = `/assets/maps/${mapName.toLowerCase()}.webp`;
        const labelText = mState.action === 'decider' ? 'DECIDER MAP' : `MAP ${idx + 1}`;

        return `
            <div class="sim-map-card summary-map-card">
                <div class="sim-map-image">
                    <img src="${mapImgUrl}" alt="${mapName}" onerror="this.src=''">
                    ${infoRowHtml}
                </div>
                <div class="sim-map-footer" style="flex-direction:column; height: 60px; font-size:16px;">
                    <span style="font-size: 11px; color: var(--accent-gold); letter-spacing:0.5px;">${labelText}</span>
                    <span>${mapName}</span>
                </div>
            </div>
        `;
    }).join('');
}

// CONFIRM AND TRANSMIT TO GLOBAL STATE
async function confirmAndPushVeto() {
    // 1. Determine target positions based on Map 1 Side Selection
    const playedMaps = Object.keys(state.mapStates).filter(k => state.mapStates[k].action === 'pick' || state.mapStates[k].action === 'decider');
    
    playedMaps.sort((x, y) => {
        const idxX = state.history.findIndex(h => h.mapName === x && (h.type === 'pick' || h.type === 'decider'));
        const idxY = state.history.findIndex(h => h.mapName === y && (h.type === 'pick' || h.type === 'decider'));
        return idxX - idxY;
    });

    const map1Name = playedMaps[0];
    const map1Sides = state.selectedMapSides[map1Name];
    if (!map1Sides || !map1Sides.defense) {
        alert('Starting sides have not been configured properly for Map 1.');
        return;
    }

    // Left Team is ALWAYS starting round 1 as Defense. Right Team starts as Attack.
    const teamAStartsOnDefense = (map1Sides.defense === 'Team A');
    
    // Assign position references
    const teamAPosition = teamAStartsOnDefense ? 'left' : 'right';
    const teamBPosition = teamAStartsOnDefense ? 'right' : 'left';

    // 2. Build Team structures for Left & Right matching dynamic assignments
    const leftTeamState = buildTeamState(teamAStartsOnDefense ? state.teamA : state.teamB, 'defense');
    const rightTeamState = buildTeamState(teamAStartsOnDefense ? state.teamB : state.teamA, 'attack');

    // 3. Build maps array mapping actors to Left / Right positions
    const mapsForState = [];
    
    // Add bans, picks and deciders in their sequential timeline order
    state.history.forEach(h => {
        if (h.type === 'ban' || h.type === 'pick') {
            const actorPos = h.actor === 'Team A' ? teamAPosition : teamBPosition;
            const mapObj = {
                name: h.mapName,
                action: h.type,
                team: actorPos
            };
            // Append map side properties if resolved
            const sides = state.selectedMapSides[h.mapName];
            if (sides && sides.defense && sides.attack) {
                mapObj.defense = sides.defense === 'Team A' ? teamAPosition : teamBPosition;
                mapObj.attack = sides.attack === 'Team A' ? teamAPosition : teamBPosition;
            }
            mapsForState.push(mapObj);
        } else if (h.type === 'decider') {
            const mapObj = {
                name: h.mapName,
                action: 'decider',
                team: null
            };
            const sides = state.selectedMapSides[h.mapName];
            if (sides && sides.defense && sides.attack) {
                mapObj.defense = sides.defense === 'Team A' ? teamAPosition : teamBPosition;
                mapObj.attack = sides.attack === 'Team A' ? teamAPosition : teamBPosition;
            }
            mapsForState.push(mapObj);
        }
    });

    // 4. Send payloads to server log and state updates
    const payload = {
        timestamp: new Date().toISOString(),
        format: state.format === 1 ? "BO1" : state.format === 3 ? "BO3" : "BO5",
        teamA: state.teamA.name,
        teamB: state.teamB.name,
        maps: state.history,
        updateState: {
            match: {
                maps: mapsForState,
                bestOf: state.format,
                round: 1,
                phase: 'buy'
            },
            teams: {
                left: leftTeamState,
                right: rightTeamState
            }
        }
    };

    try {
        const res = await fetch('/api/confirm-veto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        
        if (result.ok) {
            alert('Map Veto successfully synced! Broadcast overlays and Admin Panel updated.');
            localStorage.removeItem('valorgg_veto_draft');
            // Redirect back to Admin Panel
            location.href = '/';
        } else {
            alert('Failed to apply veto update.');
        }
    } catch (e) {
        console.error('Error confirming veto:', e);
        alert('Network error confirming map veto.');
    }
}

// Construct team state from roster database object
function buildTeamState(rosterTeam, startingSide) {
    const players = [
        { id: 'p1', name: 'Player 1', agent: '', alive: true, agentLocked: false, agentImg: '' },
        { id: 'p2', name: 'Player 2', agent: '', alive: true, agentLocked: false, agentImg: '' },
        { id: 'p3', name: 'Player 3', agent: '', alive: true, agentLocked: false, agentImg: '' },
        { id: 'p4', name: 'Player 4', agent: '', alive: true, agentLocked: false, agentImg: '' },
        { id: 'p5', name: 'Player 5', agent: '', alive: true, agentLocked: false, agentImg: '' }
    ];
    if (startingSide === 'attack') {
        players.forEach((p, idx) => p.id = 'p' + (idx + 6)); // right team players use p6 to p10
    }
    
    const rosterPlayers = rosterTeam.players || [];
    players.forEach((p, idx) => {
        const member = rosterPlayers[idx] || { name: 'Player ' + (idx + 1), playerImg: '' };
        p.name = member.name;
        p.playerImg = member.playerImg || '';
    });

    return {
        name: rosterTeam.name,
        tag: rosterTeam.tag || '',
        score: 0,
        logoUrl: rosterTeam.logoUrl || '',
        side: startingSide,
        roundWins: [],
        lossStreak: 0,
        players: players
    };
}
