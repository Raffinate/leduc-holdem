'use strict';

// ── Card constants ─────────────────────────────────────────────────────────
const CARD_LABEL = ['J', 'Q', 'K'];
const J = 0, Q = 1, K = 2;

// ── Action constants ───────────────────────────────────────────────────────
const CHECK = 'Check', BET = 'Bet', CALL = 'Call', RAISE = 'Raise', FOLD = 'Fold';
const CFR_STRATEGIES = ['exact','relative','pair','card_only','board_only','pair_only','blind'];
const ALL_STRATEGIES = [...CFR_STRATEGIES, 'abc', 'random', 'always_call', 'always_raise', 'human'];

const STRATEGY_LABELS = {
    exact: 'Exact (CFR)',         relative: 'Relative (CFR)',   pair: 'Pair (CFR)',
    card_only: 'Card Only (CFR)', board_only: 'Board Only (CFR)', pair_only: 'Pair Only (CFR)',
    blind: 'Blind (CFR)',         abc: 'ABC (heuristic)',        random: 'Random',
    always_call: 'Always Call',   always_raise: 'Always Raise',
    human: 'vs Human (WebRTC)',
};

const HOTKEYS = {
    [CHECK]: ['Space', ' '], [BET]: ['B', 'b'], [CALL]: ['C', 'c'],
    [RAISE]: ['R', 'r'],     [FOLD]: ['F', 'f'],
};

// ── Leduc game engine ──────────────────────────────────────────────────────

function actionLabel(a) {
    if (a === CHECK) return 'c';
    if (a === BET)   return 'b';
    if (a === CALL)  return 'ca';
    if (a === RAISE) return 'r';
    if (a === FOLD)  return 'f';
    return '';
}

function isRoundDone(r) {
    const n = r.length;
    if (n < 2) return false;
    if (r[n - 1] === FOLD) return true;
    if (n === 2) return (r[0] === CHECK && r[1] === CHECK) || (r[0] === BET && r[1] === CALL);
    if (n === 3) return (r[0] === CHECK && r[1] === BET && r[2] === CALL) ||
                        (r[0] === BET   && r[1] === RAISE && r[2] === CALL);
    if (n === 4) return r[0] === CHECK && r[1] === BET && r[2] === RAISE &&
                        (r[3] === CALL || r[3] === FOLD);
    return false;
}

function legalActions(r1, r2) {
    const round = isRoundDone(r1) ? r2 : r1;
    const hasBet   = round.some(a => a === BET || a === RAISE);
    const hasRaise = round.some(a => a === RAISE);
    if (!hasBet)   return [CHECK, BET];
    if (!hasRaise) return [FOLD, CALL, RAISE];
    return [FOLD, CALL];
}

function currentPlayer(r1, r2, hasPrivate, pubCard) {
    if (!hasPrivate) return 'chance';
    if (!isRoundDone(r1)) return r1.length % 2;
    if (pubCard === null) return 'chance';
    return r2.length % 2;
}

function isTerminal(r1, r2, pubCard) {
    if (r1.length > 0 && r1[r1.length - 1] === FOLD) return true;
    if (!isRoundDone(r1)) return false;
    if (pubCard === null) return false;
    return isRoundDone(r2);
}

function dealPrivate() {
    const outcomes = [];
    for (let c0 = 0; c0 < 3; c0++)
        for (let c1 = 0; c1 < 3; c1++)
            outcomes.push({ c0, c1, p: c0 === c1 ? 2 / 30 : 4 / 30 });
    return sampleWeighted(outcomes, o => o.p);
}

function dealPublic(c0, c1) {
    const counts = [2, 2, 2];
    counts[c0]--;
    counts[c1]--;
    const total = counts.reduce((s, v) => s + v, 0);
    const outcomes = [0, 1, 2].filter(c => counts[c] > 0)
                              .map(c => ({ card: c, p: counts[c] / total }));
    return sampleWeighted(outcomes, o => o.p).card;
}

function potContributions(r1, r2) {
    const contrib = [1, 1];
    addRoundContrib(contrib, r1, 2);
    addRoundContrib(contrib, r2, 4);
    return contrib;
}

function addRoundContrib(contrib, actions, bet) {
    const committed = [0, 0];
    let p = 0;
    for (const a of actions) {
        if (a === BET)   committed[p] += bet;
        if (a === CALL)  committed[p] = committed[1 - p];
        if (a === RAISE) committed[p] = committed[1 - p] + bet;
        p = 1 - p;
    }
    contrib[0] += committed[0];
    contrib[1] += committed[1];
}

function showdownWinner(cards, pubCard) {
    const p0p = cards[0] === pubCard, p1p = cards[1] === pubCard;
    if (p0p && !p1p) return 0;
    if (p1p && !p0p) return 1;
    if (cards[0] > cards[1]) return 0;
    if (cards[1] > cards[0]) return 1;
    return null;
}

function utility(cards, pubCard, r1, r2, player) {
    const contrib = potContributions(r1, r2);
    if (r1.length > 0 && r1[r1.length - 1] === FOLD) {
        const folder = (r1.length - 1) % 2;
        return folder === player ? -contrib[player] : contrib[1 - player];
    }
    if (r2.length > 0 && r2[r2.length - 1] === FOLD) {
        const folder = (r2.length - 1) % 2;
        return folder === player ? -contrib[player] : contrib[1 - player];
    }
    const winner = showdownWinner(cards, pubCard);
    if (winner === null) return 0;
    return winner === player ? contrib[1 - player] : -contrib[player];
}

function infoStateKey(card, pubCard, r1, r2, strategy) {
    const r1s = r1.map(actionLabel).join('');
    const r2s = r2.map(actionLabel).join('');
    const cl  = CARD_LABEL[card];
    const pl  = pubCard !== null ? CARD_LABEL[pubCard] : '-';
    switch (strategy) {
        case 'exact':
            return `${cl}|${pl}|${r1s}|${r2s}`;
        case 'relative': {
            const d = pubCard === null ? '-' : card === pubCard ? 'pair' : card < pubCard ? 'higher' : 'lower';
            return `${cl}|${d}|${r1s}|${r2s}`;
        }
        case 'pair': {
            const d = pubCard === null ? '-' : card === pubCard ? 'pair' : 'no_pair';
            return `${cl}|${d}|${r1s}|${r2s}`;
        }
        case 'card_only':
            return `${cl}|${pubCard !== null ? 'pub' : '-'}|${r1s}|${r2s}`;
        case 'board_only':
            return `-|${pl}|${r1s}|${r2s}`;
        case 'pair_only': {
            const d = pubCard === null ? '-' : card === pubCard ? 'pair' : 'no_pair';
            return `${d}|${r1s}|${r2s}`;
        }
        case 'blind':
            return `${pubCard !== null ? 'pub' : '-'}|${r1s}|${r2s}`;
        default:
            return '';
    }
}

function sampleWeighted(items, weight) {
    let r = Math.random();
    for (const item of items) {
        r -= weight(item);
        if (r <= 0) return item;
    }
    return items[items.length - 1];
}

// ── Strategy dispatch ──────────────────────────────────────────────────────

function chooseAction(strategy, strategyData, card, pubCard, r1, r2, player) {
    const actions = legalActions(r1, r2);
    if (CFR_STRATEGIES.includes(strategy)) {
        const key = infoStateKey(card, pubCard, r1, r2, strategy);
        const entry = strategyData && strategyData[key];
        if (entry) {
            let r = Math.random();
            for (const a of actions) {
                r -= (entry[a] || 0);
                if (r <= 0) return a;
            }
        }
        return actions[Math.floor(Math.random() * actions.length)];
    }
    return fixedAction(strategy, card, pubCard, actions);
}

function fixedAction(strategy, card, pubCard, actions) {
    const has = a => actions.includes(a);
    const prefer = (...prefs) => prefs.find(has) || actions[0];
    switch (strategy) {
        case 'always_raise': return prefer(RAISE, BET, CALL, CHECK, FOLD);
        case 'always_call':  return prefer(CALL, CHECK, FOLD);
        case 'random': {
            const pool = has(CHECK) ? actions.filter(a => a !== FOLD) : actions;
            return pool[Math.floor(Math.random() * pool.length)];
        }
        case 'abc': {
            const pair = pubCard !== null && card === pubCard;
            if (pair || card === K) return prefer(RAISE, BET, CALL, CHECK, FOLD);
            if (card === J)         return prefer(CHECK, FOLD, CALL, RAISE, BET);
            return prefer(CHECK, CALL, FOLD, RAISE, BET);
        }
    }
    return actions[0];
}

// ── Session state ──────────────────────────────────────────────────────────

let gStrategy = 'exact';
let gStrategyData = null;
let gCards = null;
let gPubCard = null;
let gR1 = [];
let gR2 = [];
let gHuman = 0;
let gResult = null;
let gLastAi = null;
let gStats = { hands: 0, net: 0 };
let gPlaying = false;
let gHistory = [];

// ── Multiplayer state ──────────────────────────────────────────────────────

let gMode = 'solo';     // 'solo' | 'mp-host' | 'mp-guest'
let gPeer = null;       // PeerJS Peer instance
let gConn = null;       // DataConnection
let gGuestSeat = null;  // guest's seat index, from host's perspective

// ── Multiplayer helpers ────────────────────────────────────────────────────

function onStrategyChange(s) {
    document.getElementById('mp-setup').style.display = s === 'human' ? '' : 'none';
}

function setMpStatus(msg) {
    const el = document.getElementById('mp-status-msg');
    if (el) el.textContent = msg;
}

function mpCopyLink(url) {
    navigator.clipboard.writeText(url).then(() => setMpStatus('Link copied!'));
}

function mpSend(msg) {
    if (gConn) gConn.send(JSON.stringify(msg));
}

function mpSendState() {
    mpSend({ type: 'state', pubCard: gPubCard, r1: gR1, r2: gR2 });
}

function mpDisconnect() {
    if (gPeer) { gPeer.destroy(); gPeer = null; }
    gConn = null;
    gMode = 'solo';
    gGuestSeat = null;
}

function mpHost() {
    setStatus('loading');
    setMpStatus('Starting…');
    document.getElementById('mp-join-row').style.display = 'none';
    gPeer = new Peer();
    gPeer.on('open', id => {
        const url = location.origin + location.pathname + '?join=' + id;
        const el = document.getElementById('mp-invite');
        el.style.display = '';
        el.innerHTML = `<span class="dim">ID: ${id}</span>`
            + ` &nbsp; <button class="btn" onclick="mpCopyLink('${url}')">Copy invite link</button>`;
        setMpStatus('Waiting for opponent…');
    });
    gPeer.on('connection', conn => {
        gConn = conn;
        conn.on('open', () => {
            gMode = 'mp-host';
            document.getElementById('mp-setup').style.display = 'none';
            gPlaying = true;
            gStats = { hands: 0, net: 0 };
            gHistory = [];
            setStatus('playing');
            newHand();
        });
        conn.on('data', raw => mpReceive(JSON.parse(raw)));
        conn.on('close', () => stopGame());
        conn.on('error', () => stopGame());
    });
    gPeer.on('error', err => setMpStatus('Error: ' + err.type));
}

function mpJoin() {
    const raw = document.getElementById('mp-join-input').value.trim();
    if (!raw) return;
    let id = raw;
    try { id = new URL(raw).searchParams.get('join') || raw; } catch (_) {}
    setStatus('loading');
    setMpStatus('Connecting…');
    document.getElementById('mp-join-row').style.display = 'none';
    gPeer = new Peer();
    gPeer.on('open', () => {
        gConn = gPeer.connect(id, { reliable: true });
        gConn.on('open', () => {
            gMode = 'mp-guest';
            gPlaying = true;
            gStats = { hands: 0, net: 0 };
            gHistory = [];
            document.getElementById('mp-setup').style.display = 'none';
            setStatus('playing');
        });
        gConn.on('data', raw => mpReceive(JSON.parse(raw)));
        gConn.on('close', () => stopGame());
        gConn.on('error', () => stopGame());
    });
    gPeer.on('error', err => {
        setMpStatus('Error: ' + err.type);
        document.getElementById('mp-join-row').style.display = '';
        setStatus('idle');
    });
}

function mpReceive(msg) {
    if (msg.type === 'start') {
        gHuman = msg.guestSeat;
        gCards = [null, null];
        gCards[gHuman] = msg.yourCard;
        gPubCard = null; gR1 = []; gR2 = []; gResult = null; gLastAi = null;
        render();
    } else if (msg.type === 'state') {
        gPubCard = msg.pubCard;
        gR1 = msg.r1;
        gR2 = msg.r2;
        render();
    } else if (msg.type === 'result') {
        if (msg.oppCard !== null) gCards[1 - gHuman] = msg.oppCard;
        const chips = msg.chips;
        gStats.hands++;
        gStats.net += chips;
        gResult = { chips, desc: msg.desc };
        const folded = (gR1.length > 0 && gR1[gR1.length - 1] === FOLD) ||
                       (gR2.length > 0 && gR2[gR2.length - 1] === FOLD);
        gHistory.unshift({
            n: gStats.hands, chips, desc: msg.desc,
            cards: gCards.slice(), pubCard: gPubCard,
            r1: gR1.slice(), r2: gR2.slice(),
            human: gHuman, revealed: !folded,
        });
        render();
    } else if (msg.type === 'action') {
        // host receives guest's action
        applyAction(msg.action);
        mpSendState();
        advance();
    } else if (msg.type === 'new_session') {
        gStats = { hands: 0, net: 0 };
        gHistory = [];
        renderHistory();
        renderStats();
    }
}

// ── Game loop ──────────────────────────────────────────────────────────────

function newHand() {
    gR1 = []; gR2 = []; gPubCard = null; gResult = null; gLastAi = null;
    if (gMode === 'mp-host') {
        gGuestSeat = Math.random() < 0.5 ? 0 : 1;
        gHuman = 1 - gGuestSeat;
        const { c0, c1 } = dealPrivate();
        gCards = [c0, c1];
        mpSend({ type: 'start', guestSeat: gGuestSeat, yourCard: gCards[gGuestSeat] });
        mpSendState();
        advance();
    } else if (gMode !== 'mp-guest') {
        gHuman = Math.random() < 0.5 ? 0 : 1;
        const { c0, c1 } = dealPrivate();
        gCards = [c0, c1];
        advance();
    }
    // mp-guest: waits for 'start' message from host
}

function advance() {
    while (true) {
        if (isTerminal(gR1, gR2, gPubCard)) { finishHand(); return; }
        const p = currentPlayer(gR1, gR2, gCards !== null, gPubCard);
        if (p === 'chance') {
            if (isRoundDone(gR1)) {
                gPubCard = dealPublic(gCards[0], gCards[1]);
                if (gMode === 'mp-host') mpSendState();
            }
        } else if (p !== gHuman) {
            if (gMode !== 'solo') {
                render();
                return; // wait for remote action via mpReceive
            }
            const ai = p;
            const action = chooseAction(gStrategy, gStrategyData, gCards[ai], gPubCard, gR1, gR2, ai);
            gLastAi = action;
            applyAction(action);
        } else {
            break;
        }
    }
    render();
}

function applyAction(action) {
    gLastAi = null;
    if (!isRoundDone(gR1)) gR1.push(action);
    else gR2.push(action);
}

function humanAct(action) {
    gLastAi = null;
    if (gMode === 'mp-guest') {
        mpSend({ type: 'action', action });
        applyAction(action);
        render(); // optimistic update; host echo confirms
    } else {
        applyAction(action);
        if (gMode === 'mp-host') mpSendState(); // notify guest of host's action
        advance();
    }
}

function finishHand() {
    const chips = utility(gCards, gPubCard, gR1, gR2, gHuman);
    gStats.hands++;
    gStats.net += chips;
    gResult = { chips, desc: describeResultFor(gHuman) };
    const folded = (gR1.length > 0 && gR1[gR1.length - 1] === FOLD) ||
                   (gR2.length > 0 && gR2[gR2.length - 1] === FOLD);

    if (gMode === 'mp-host') {
        mpSend({
            type: 'result',
            chips: utility(gCards, gPubCard, gR1, gR2, gGuestSeat),
            desc: describeResultFor(gGuestSeat),
            oppCard: folded ? null : gCards[gHuman],
        });
    }

    gHistory.unshift({
        n: gStats.hands, chips,
        desc: gResult.desc,
        cards: gCards.slice(),
        pubCard: gPubCard,
        r1: gR1.slice(), r2: gR2.slice(),
        human: gHuman,
        revealed: !folded,
    });
    render();
}

function describeResultFor(player) {
    const r1fold = gR1.length > 0 && gR1[gR1.length - 1] === FOLD;
    const r2fold = gR2.length > 0 && gR2[gR2.length - 1] === FOLD;
    if (r1fold || r2fold) {
        const r = r1fold ? gR1 : gR2;
        return (r.length - 1) % 2 === player ? 'you folded' : 'opponent folded';
    }
    const handStr = p => {
        const c = gCards[p];
        return c === gPubCard ? CARD_LABEL[c] + CARD_LABEL[c] : CARD_LABEL[c];
    };
    const u = utility(gCards, gPubCard, gR1, gR2, player);
    const yours = handStr(player), theirs = handStr(1 - player);
    if (u > 0) return `${yours} > ${theirs}`;
    if (u < 0) return `${yours} < ${theirs}`;
    return `${yours} = ${theirs}`;
}

// ── Rendering ──────────────────────────────────────────────────────────────

function render() {
    renderCards();
    renderInfo();
    renderActions();
    renderStats();
    renderHistory();
}

function renderCards() {
    const inResult = gResult !== null;
    const folded = (gR1.length > 0 && gR1[gR1.length - 1] === FOLD) ||
                   (gR2.length > 0 && gR2[gR2.length - 1] === FOLD);

    setCard('card-human', gCards ? gCards[gHuman] : null, false, false);
    setCard('card-board', gPubCard !== null ? gPubCard : null, true, false);
    const showOpp = inResult && !folded;
    const oppCard = (showOpp && gCards) ? gCards[1 - gHuman] : null;
    const canRevealFold = gMode === 'solo' && gCards !== null && gCards[1 - gHuman] !== null;
    setCard('card-opp', oppCard, false, true, inResult && folded && canRevealFold);
}

function setCard(id, card, isBoard, isOpp, foldReveal) {
    const el = document.getElementById(id);
    if (card !== null && card !== undefined) {
        const label = CARD_LABEL[card];
        const suits = isBoard ? ['♥', '#c44'] : isOpp ? ['♣', '#222'] : ['♠', '#222'];
        el.innerHTML = `<div class="card card-face">
            <span class="rank-corner">${label}${suits[0]}</span>
            <span class="rank-center" style="color:${suits[1]}">${label}</span>
            <span class="suit-center" style="color:${suits[1]}">${suits[0]}</span>
        </div>`;
    } else if (isOpp) {
        el.innerHTML = foldReveal
            ? `<div class="card card-back clickable" onclick="revealOpp(this)" title="Click to reveal">?</div>`
            : `<div class="card card-back"></div>`;
    } else {
        el.innerHTML = `<div class="card card-empty">?</div>`;
    }
}

function revealOpp(el) {
    if (!gCards || gCards[1 - gHuman] === null) return;
    const card = gCards[1 - gHuman];
    el.outerHTML = `<div class="card card-face">
        <span class="rank-corner">${CARD_LABEL[card]}♣</span>
        <span class="rank-center">${CARD_LABEL[card]}</span>
        <span class="suit-center">♣</span>
    </div>`;
    if (gHistory.length > 0) {
        gHistory[0].revealed = true;
        renderHistory();
    }
}

function actionsWithCosts(actions, bet) {
    const committed = [0, 0];
    let p = 0;
    return actions.map(a => {
        let cost = null;
        if (a === BET)   { cost = bet;                                 committed[p] += bet; }
        if (a === CALL)  { cost = committed[1-p] - committed[p];       committed[p] = committed[1-p]; }
        if (a === RAISE) { cost = committed[1-p] + bet - committed[p]; committed[p] = committed[1-p] + bet; }
        p = 1 - p;
        return cost ? `${a} ${cost}` : a;
    });
}

function renderInfo() {
    const infoEl = document.getElementById('game-info');
    if (!gPlaying || !gCards) { infoEl.innerHTML = ''; return; }
    const pot = potContributions(gR1, gR2).reduce((a, b) => a + b, 0);
    const round = isRoundDone(gR1) && gPubCard !== null ? 'Round 2' : 'Round 1';
    const pos = gHuman === 0 ? 'P1 (acts first)' : 'P2 (acts second)';
    let html = `<div class="info-row">${round} &nbsp;|&nbsp; Pot: ${pot}</div>
        <div class="info-row dim">You are ${pos}</div>`;
    if (gR1.length > 0) {
        html += `<div class="history">R1: ${actionsWithCosts(gR1, 2).join(' → ')}</div>`;
    }
    if (gR2.length > 0) {
        html += `<div class="history">R2: ${actionsWithCosts(gR2, 4).join(' → ')}</div>`;
    }
    if (gLastAi) {
        html += `<div class="ai-action">Opponent: ${gLastAi.toLowerCase()}</div>`;
    }
    infoEl.innerHTML = html;
}

function renderActions() {
    const actEl = document.getElementById('actions-area');
    const resEl = document.getElementById('result-area');
    resEl.innerHTML = '';
    actEl.innerHTML = '';
    if (!gPlaying) return;

    if (gResult) {
        const { chips, desc } = gResult;
        const cls  = chips > 0 ? 'win' : chips < 0 ? 'loss' : 'draw';
        const sign = chips > 0 ? '+' : '';
        resEl.innerHTML = `<div class="result ${cls}">
            <span class="chips">${sign}${chips}</span>
            <span class="desc">${desc}</span>
        </div>`;
        if (gMode !== 'mp-guest') {
            actEl.innerHTML = `<button class="btn btn-next" id="next-btn" onclick="nextHand()">Next hand &nbsp;<kbd>Space</kbd></button>`;
        } else {
            actEl.innerHTML = `<div class="dim">Waiting for host…</div>`;
        }
        return;
    }

    const p = currentPlayer(gR1, gR2, gCards !== null, gPubCard);
    if (p !== gHuman) {
        if (gMode !== 'solo') actEl.innerHTML = `<div class="dim">Waiting for opponent…</div>`;
        return;
    }

    const actions = legalActions(gR1, gR2);
    const btns = actions.map(a => {
        const cost = actionCost(a);
        const costStr = cost !== null ? ` +${cost}` : '';
        const hk = HOTKEYS[a][0];
        return `<button class="btn btn-action" onclick="humanAct('${a}')">${a}${costStr} <kbd>${hk}</kbd></button>`;
    }).join('');
    actEl.innerHTML = `<div class="actions">${btns}</div>`;
}

function actionCost(action) {
    const inR2 = gPubCard !== null && isRoundDone(gR1);
    const bet = inR2 ? 4 : 2;
    const round = inR2 ? gR2 : gR1;
    const committed = [0, 0];
    let p = 0;
    for (const a of round) {
        if (a === BET)   committed[p] += bet;
        if (a === CALL)  committed[p] = committed[1 - p];
        if (a === RAISE) committed[p] = committed[1 - p] + bet;
        p = 1 - p;
    }
    const me = round.length % 2;
    if (action === BET)   return bet;
    if (action === CALL)  return committed[1 - me] - committed[me];
    if (action === RAISE) return committed[1 - me] + bet - committed[me];
    return null;
}

function renderStats() {
    const el = document.getElementById('stats');
    if (!gPlaying) { el.textContent = ''; return; }
    const sign = gStats.net >= 0 ? '+' : '';
    el.textContent = `${sign}${gStats.net.toFixed(0)} chips  (${gStats.hands} hands)`;
}

function renderHistory() {
    const el = document.getElementById('history-log');
    if (!el) return;
    if (gHistory.length === 0) { el.innerHTML = ''; return; }

    const rows = gHistory.map(h => {
        const cls  = h.chips > 0 ? 'win' : h.chips < 0 ? 'loss' : 'draw';
        const sign = h.chips > 0 ? '+' : '';
        const youCard   = h.cards[h.human] !== null ? CARD_LABEL[h.cards[h.human]] : '?';
        const oppCard   = h.revealed && h.cards[1 - h.human] !== null ? CARD_LABEL[h.cards[1 - h.human]] : '?';
        const boardCard = h.pubCard !== null ? CARD_LABEL[h.pubCard] : '—';
        const r1str = h.r1.length ? actionsWithCosts(h.r1, 2).join(' → ') : '—';
        const r2str = h.r2.length ? actionsWithCosts(h.r2, 4).join(' → ') : '—';
        const r2line = h.r2.length ? `<div class="log-row dim">R2: ${r2str}</div>` : '';
        return `<div class="log-entry">
            <div class="log-row">
                <span class="log-n dim">#${h.n}</span>
                <span class="log-chips ${cls}">${sign}${h.chips}</span>
                <span class="log-desc dim">${h.desc}</span>
            </div>
            <div class="log-row dim">You: ${youCard} &nbsp; Board: ${boardCard} &nbsp; Opp: ${oppCard}</div>
            <div class="log-row dim">R1: ${r1str}</div>
            ${r2line}
        </div>`;
    }).join('');

    el.innerHTML = rows;
}

function nextHand() { newHand(); }

// ── Keyboard handler ───────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!gPlaying) return;
    if (gResult) {
        if (gMode !== 'mp-guest' && (e.key === ' ' || e.key === 'Enter')) {
            e.preventDefault(); nextHand();
        }
        return;
    }
    const p = currentPlayer(gR1, gR2, gCards !== null, gPubCard);
    if (p !== gHuman) return;
    const actions = legalActions(gR1, gR2);
    for (const a of actions) {
        if (HOTKEYS[a].includes(e.key)) { e.preventDefault(); humanAct(a); return; }
    }
});

// ── Theme ──────────────────────────────────────────────────────────────────

function toggleTheme() {
    const light = document.body.classList.toggle('light');
    localStorage.setItem('theme', light ? 'light' : 'dark');
    document.getElementById('theme-btn').textContent = light ? 'Dark' : 'Light';
}

// ── Controls ───────────────────────────────────────────────────────────────

function startGame(strategy) {
    gStrategy = strategy;
    gStats = { hands: 0, net: 0 };
    gPlaying = false;
    gResult = null;

    if (strategy === 'human') {
        mpHost();
        return;
    }

    if (CFR_STRATEGIES.includes(strategy)) {
        setStatus('loading');
        fetch(`data/${strategy}.json`)
            .then(r => r.json())
            .catch(() => { setStatus('error'); throw null; })
            .then(data => {
                gStrategyData = data;
                gPlaying = true;
                setStatus('playing');
                newHand();
            });
    } else {
        gStrategyData = null;
        gPlaying = true;
        setStatus('playing');
        newHand();
    }
}

function stopGame() {
    mpDisconnect();
    gPlaying = false;
    gCards = null;
    gHistory = [];
    setStatus('idle');
    document.getElementById('game-info').innerHTML = '';
    document.getElementById('actions-area').innerHTML = '';
    document.getElementById('result-area').innerHTML = '';
    document.getElementById('history-log').innerHTML = '';
    renderCards();
    renderStats();
    if (gStrategy === 'human') {
        document.getElementById('mp-setup').style.display = '';
        document.getElementById('mp-invite').style.display = 'none';
        document.getElementById('mp-join-row').style.display = '';
        document.getElementById('mp-join-input').value = '';
        setMpStatus('');
    }
}

function newSession() {
    gStats = { hands: 0, net: 0 };
    gHistory = [];
    if (gMode === 'mp-host') mpSend({ type: 'new_session' });
    renderHistory();
    newHand();
}

function setStatus(status) {
    const statusEl  = document.getElementById('status');
    const startBtn  = document.getElementById('start-btn');
    const stopBtn   = document.getElementById('stop-btn');
    const newSessBtn = document.getElementById('new-session-btn');
    const stratSel  = document.getElementById('strategy-select');

    statusEl.className = status;
    stratSel.disabled = (status !== 'idle');
    startBtn.style.display   = (status === 'idle')    ? '' : 'none';
    stopBtn.style.display    = (status === 'playing' || status === 'loading') ? '' : 'none';
    newSessBtn.style.display = (status === 'playing') ? '' : 'none';

    if (status === 'idle')    { statusEl.textContent = ''; renderCards(); }
    if (status === 'loading') { statusEl.textContent = ''; }
    if (status === 'playing') { statusEl.textContent = ''; }
    if (status === 'error')   { statusEl.textContent = 'Failed to load strategy. Are you running a local server?'; }
}

// ── Init ───────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
    const sel = document.getElementById('strategy-select');
    for (const s of ALL_STRATEGIES) {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = STRATEGY_LABELS[s];
        sel.appendChild(opt);
    }

    document.getElementById('theme-btn').textContent =
        document.body.classList.contains('light') ? 'Dark' : 'Light';

    // Auto-join if ?join= param is present in URL
    const joinId = new URLSearchParams(location.search).get('join');
    if (joinId) {
        sel.value = 'human';
        document.getElementById('mp-setup').style.display = '';
        document.getElementById('mp-join-input').value = joinId;
        mpJoin();
    }

    // Show idle card backs
    ['card-human', 'card-opp'].forEach(id => {
        document.getElementById(id).innerHTML = '<div class="card card-back"></div>';
    });
    document.getElementById('card-board').innerHTML = '<div class="card card-empty">?</div>';
});
