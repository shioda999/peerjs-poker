// game.js

/* =====================
   Cards
===================== */
const SUITS = ["s", "h", "d", "c"];
const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const RAISEAMOUNT = 20;
const INITSTACK = 150;

let game = {"players": [], "waiting_players": [], "raiseAmount": RAISEAMOUNT, "initStack": INITSTACK};

function makeDeck() {
  return SUITS.flatMap(s => RANKS.map(r => r + s));
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

let buttonIndex = 0; // BTN（Dealer）

/* =====================
   Position Helpers
===================== */
function getSBIndex() {
  return (buttonIndex + 1) % game.players.length;
}

function getBBIndex() {
  return (buttonIndex + 2) % game.players.length;
}

function getFirstTurnOfPhase(phase) {
  if (phase === "preflop") {
    // BBの左（UTG）
    return (getBBIndex() + 1) % game.players.length;
  } else {
    // BTNの左（SB）
    return getSBIndex();
  }
}

/* =====================
   dealGameProc
===================== */
function dealGameProc(event) { // client
  switch (event) {
    case "START":
      startGame();
      break;
    case "NEXT_PHASE":
      nextPhase();
      break;
    case "PLAY_SE_RAISE":
      playSE("up");
      // console.log("playse up");
      break;
    case "SINGLE":
      showdown();
      break;
    case "RESULT":
      showResult();
      break;
  }
  updateUI();
}

function startGame() {
  closeResultModal(false);
  // 配布後にプリフロップ初手番
  game.turn = getFirstTurnOfPhase("preflop");
  normalizeTurn();
  // カード配布アニメーション
  animateDealingHands(() => {
    waitPlayer();
    playBGM();
  });
}

function initStack() {
  game.players.forEach(p => { p.stack = game.initStack });
  console.log(game.players)
}

/* =====================
   Init Hand
===================== */
function initHand() {
  const deck = makeDeck();
  shuffle(deck);

  if (game.waiting_players.length > 0)
    game.players.push(...game.waiting_players)

  game = {
    phase: "preflop",
    deck,
    board: [],
    pot: 0,
    currentBet: 0,
    turn: 0,
    result: "",
    players: game.players,
    waiting_players: [],
    raiseAmount: game.raiseAmount,
    initStack: game.initStack,
    raiseCount: 0,
    board_animating: [...Array(5)].map(() => true),
  };

  game.board = [...Array(5)].map(() => deck.pop());

  game.players.forEach(p => {
    p.hand = [];
    p.hand_animating = [true, true];
    p.bet = 0;
    p.acted = false;
    p.last_action = "";
    p.folded = p.stack === 0 ? true : false;
    p.handResult = null;
    p.win = false;
  });

  // hole cards
  for (let i = 0; i < 2; i++) {
    game.players.forEach(p => p.hand.push(deck.pop()));
  }

  // blinds
  const sb = getSBIndex();
  const bb = getBBIndex();
  postBlind(game.players[sb], 5);
  postBlind(game.players[bb], 10);
  game.currentBet = 10;
}

function waitPlayer() {
  const p = game.players[game.turn];
  broadcastState("NONE");
  if (!p.isHuman && isHost) {
    cpuMove(p);
  }
}

function postBlind(p, amt) {
  amt = Math.min(p.stack, amt);
  p.stack -= amt;
  p.bet += amt;
  game.pot += amt;
}

function is_me(player) {
  return player.id === player_id
}
/* =====================
   Player Actions
===================== */
function act(type, playerId=player_id, raiseAmount=0) {
  const p = game.players[game.turn];
  if (p.id !== playerId || game.phase === "showdown" || !isHost) return;
  
  if (type === "fold") fold(p);
  if (type === "call") call(p);
  if (type === "raise") raise(p, raiseAmount);

  nextTurn();
}

function pushActButton(type) {
  const p = game.players[game.turn];
  if (!is_me(p) || game.phase === "showdown") return;
  if (type == "raise") {
    me = game.players.filter(p => is_me(p))[0]
    openRaiseModal({
      min: game.raiseAmount + game.currentBet - p.bet,
      max: me.stack,
      value: game.raiseAmount + game.currentBet - p.bet
    });
  }
  else doAct(type);
}

function doAct(type, raiseAmount=0) {
  const p = game.players[game.turn];
  const diff = game.currentBet - p.bet;
  if (!isHost) send({ type: "ACT", action: type, playerId: player_id, raiseAmount: raiseAmount - diff});
  else act(type, player_id, raiseAmount - diff);
}

window.pushActButton = pushActButton;

function fold(p) {
  p.folded = true;
  p.acted = true;
  p.last_action = "fold";
}

function call(p) {
  const need = Math.min(game.currentBet - p.bet, p.stack);
  if (need > 0) {
    p.stack -= need;
    p.bet += need;
    game.pot += need;
  }
  p.acted = true;
  p.last_action = "call";
}

function raise(p, amt) {
  const newBet = game.currentBet + amt;
  const need = Math.min(newBet - p.bet, p.stack);

  if (p.stack < need) {
    call(p);
    return;
  }

  p.stack -= need;
  p.bet += need;
  game.pot += need;
  game.currentBet = newBet;
  game.raiseCount += 1;
  p.acted = true;

  game.players.forEach(o => {
    if (o !== p && !o.folded) {
      o.acted = false;
      o.last_action = "";
    }
  });

  p.last_action = "raise";
  broadcastState("PLAY_SE_RAISE");
}

/* =====================
   Turn / Phase
===================== */
function nextTurn() {
  if (isAliveSingle()) {
    broadcastState("SINGLE");
    return;
  }

  // 1. 現在のフェーズが終了したかチェック
  if (bettingDone()) {
    updateUI();
    setTimeout(() => broadcastState("NEXT_PHASE"), 500);
    return;
  }

  // 2. 次の有効なプレイヤーまでターンを進める
  advanceTurn();

  // 3. UI更新
  updateUI();

  waitPlayer();
}

function advanceTurn() {
  game.turn = (game.turn + 1) % game.players.length;
  normalizeTurn();
}

function normalizeTurn() {
  let safety = 0;
  while (game.players[game.turn].folded || game.players[game.turn].stack == 0) {
    game.turn = (game.turn + 1) % game.players.length;
    safety++;
    if (safety > game.players.length) break;
  }
}

function bettingDone() {
  // まだゲームに残っている（Foldしていない）プレイヤーを抽出
  const alive = game.players.filter(p => !p.folded);
  flag = alive.every(p => 
    p.acted === true && p.bet === game.currentBet || p.stack === 0
  );

  // 以下の条件を「すべて」満たしているかチェック
  return flag
}

function nextPhase() {
  game.players.forEach(p => {
    p.acted = false;
    p.last_action = "";
  });

  if (game.phase === "preflop") {
    animateDealBoard([0,1,2]);
    game.phase = "flop";
  } else if (game.phase === "flop") {
    animateDealBoard([3]);
    game.phase = "turn";
  } else if (game.phase === "turn") {
    animateDealBoard([4]);
    game.phase = "river";
  } else {
    showdown();
    return;
  }

  game.turn = getFirstTurnOfPhase(game.phase);

  normalizeTurn();
  updateUI();

  if (bettingDone()) broadcastState("NEXT_PHASE");
  else waitPlayer();
}

/* =====================
   Single Winner (全員Fold)
===================== */
function isAliveSingle() {
  const alive = game.players.filter(p => !p.folded);
  return alive.length === 1
}

/* =====================
   Showdown
===================== */
function showdown() {
  let names = [];

  settleHand();

  game.players.forEach(p => {
    if (p.win) names.push(p.name)
  })
  game.result = `Winner: ${names.join(", ")}`;
  game.phase = "showdown";
  updateUI();

  const player = game.players.filter(p => is_me(p))[0];
  if (player.win) playSE("win");
  if (player.stack === 0) setTimeout(() => nextHand(), 1000);
}

function settleHand() {
  const alive = game.players.filter(p => !p.folded);

  const solved = alive.map(p => ({
    player: p,
    hand: Hand.solve(p.hand.concat(game.board))
  }));

  game.players.forEach(p => p.handResult = null);

  // 勝利フラグ初期化
  alive.forEach(p => {
    p.win = false;
    p.handResult = "";
  });

  // bet昇順（bet > 0 のみ）
  const sorted = [...alive]
    .filter(p => p.bet > 0)
    .sort((a, b) => a.bet - b.bet);

  let remaining = [...sorted];
  let prevBet = 0;
  const pots = [];

  // ポット構築
  for (const p of sorted) {
    const diff = p.bet - prevBet;
    if (diff <= 0) continue;

    pots.push({
      amount: diff * remaining.length,
      players: [...remaining]
    });

    prevBet = p.bet;
    remaining = remaining.filter(r => r !== p);
  }

  // ポットごとに分配
  for (const pot of pots) {
    const potSolved = solved.filter(s =>
      pot.players.includes(s.player)
    );

    const winners = Hand.winners(
      potSolved.map(s => s.hand)
    );

    const share = pot.amount / winners.length;

    potSolved.forEach(s => {
      s.player.handResult = s.hand.descr;
      if (winners.includes(s.hand)) {
        s.player.stack += share;
        s.player.win = true;
      }
    });
  }
  if (alive.length == 1)
    alive[0].handResult = "Uncontested";
}

/* =====================
   Next Hand
===================== */
function nextHand() {
  if (game.phase !== "showdown") return;
  if (!isHost) {
    send({ type: "NEXT_HAND", playerId: player_id});
  }
  else {
    buttonIndex = (buttonIndex + 1) % game.players.length;
  }
  game.phase = "wait"
  playerNextHand(player_id);
}

function playerNextHand(playerId) {
  all_ok = true;
  game.players.forEach(n => {
    if (n.stack === 0) n.waiting = true;
    if (!n.isHuman) n.waiting = true;
    if (n.id == playerId) n.waiting = true;
    if (!n.waiting) all_ok = false;
  })
  if (all_ok && isHost) {
    if (checkGameOver()) {
      broadcastState("RESULT");
    }
    else {
      game.players.forEach(n => { n.waiting = false; })
      initHand();
      broadcastState("START");
    }
  }
}

function pushNextHandButton() {
  if (game.phase !== "showdown") return;
  nextHand();
}
window.pushNextHandButton = pushNextHandButton;

function checkGameOver() {
  const humans = game.players.filter(p => p.isHuman);
  const remainPlayers = humans.filter(p => p.stack > 0);
  if (humans.length == 1)
    return remainPlayers.length === 0;
  return remainPlayers.length <= 1;
}

function showResult() {
  const player = game.players.filter(p => is_me(p))[0];
  if (player.win) playSE("victory");
  else playSE("lose");
  openResultModal(game.players);
}