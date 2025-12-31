// game.js

/* =====================
   Cards
===================== */
const SUITS = ["s", "h", "d", "c"];
const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];

function makeDeck() {
  return SUITS.flatMap(s => RANKS.map(r => r + s));
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

/* =====================
   MATCH STATE (永続)
===================== */
// const players = [
//   { name: "You",  isHuman: true, is_me: true,  stack: 1000 },
//   { name: "CPU1", isHuman: false, is_me: false, stack: 1000 },
//   { name: "CPU2", isHuman: false, is_me: false, stack: 1000 },
//   { name: "Human", isHuman: true, is_me: false, stack: 1000 }
// ];

let buttonIndex = 0; // BTN（Dealer）

/* =====================
   HAND STATE
===================== */
let game = {"players": [], "waiting_players": [], "raiseAmount": 20};

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
    case "SINGLE":
      singleWinner();
      break;
  }
  updateUI();
}

function startGame() {
  // 配布後にプリフロップ初手番
  game.turn = getFirstTurnOfPhase("preflop");
  normalizeTurn();
  // カード配布アニメーション
  animateDealingHands(() => {
    waitPlayer();
  });
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
    p.folded = false;
    p.handResult = null;
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
function act(type, playerId=player_id) {
  const p = game.players[game.turn];
  if (p.id !== playerId || game.phase === "showdown" || !isHost) return;
  
  if (type === "fold") fold(p);
  if (type === "call") call(p);
  if (type === "raise") raise(p, game.raiseAmount);

  nextTurn();
}

function pushActButton(type) {
  const p = game.players[game.turn];
  if (!is_me(p) || game.phase === "showdown") return;
  if (!isHost) send({ type: "ACT", action: type, playerId: player_id});
  else act(type);
}

window.pushActButton = pushActButton;

function fold(p) {
  p.folded = true;
  p.acted = true;
  p.last_action = "fold";
}

function call(p) {
  const need = game.currentBet - p.bet;
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
  const need = newBet - p.bet;

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
    setTimeout(() => broadcastState("NEXT_PHASE"), 800);
    return;
  }

  // 2. 次の有効なプレイヤーまでターンを進める
  advanceTurn();

  // 3. UI更新
  updateUI();

  waitPlayer();
}

function advanceTurn() {
  let safety = 0;
  do {
    game.turn = (game.turn + 1) % game.players.length;
    safety++;
    if (safety > game.players.length) break;
  } while (game.players[game.turn].folded); // Foldしている間は飛ばし続ける
}

function normalizeTurn() {
  let safety = 0;
  while (game.players[game.turn].folded) {
    game.turn = (game.turn + 1) % game.players.length;
    safety++;
    if (safety > game.players.length) break;
  }
}

function bettingDone() {
  // まだゲームに残っている（Foldしていない）プレイヤーを抽出
  const alive = game.players.filter(p => !p.folded);
  flag = alive.every(p => 
    p.acted === true &&               // 1. 少なくとも1回は手番を終えている
    p.bet === game.currentBet    // 2. 出しているチップ額が現在のベット額と一致している
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
    game.phase = "showdown";
    showdown();
    return;
  }

  game.turn = getFirstTurnOfPhase(game.phase);
  normalizeTurn();
  updateUI();

  waitPlayer();
}

/* =====================
   Single Winner (全員Fold)
===================== */
function isAliveSingle() {
  const alive = game.players.filter(p => !p.folded);
  return alive.length === 1
}

function singleWinner() {
  const alive = game.players.filter(p => !p.folded);
  const winner = alive[0];
  winner.stack += game.pot;

  game.players.forEach(p => p.handResult = null);
  winner.handResult = "Uncontested";

  game.phase = "showdown";
  game.result = `Winner: ${winner.name}`;
  updateUI();
}

/* =====================
   Showdown
===================== */
function showdown() {
  const alive = game.players.filter(p => !p.folded);

  const solved = alive.map(p => ({
    player: p,
    hand: Hand.solve(p.hand.concat(game.board))
  }));

  const winners = Hand.winners(solved.map(s => s.hand));
  const winAmount = game.pot / winners.length;

  game.players.forEach(p => p.handResult = null);

  const names = [];

  solved.forEach(s => {
    s.player.handResult = s.hand.descr;
    if (winners.includes(s.hand)) {
      s.player.stack += winAmount;
      names.push(s.player.name);
    }
  });

  game.result = `Winner: ${names.join(", ")}`;
  game.phase = "showdown";
  updateUI();
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
    if (!n.isHuman) n.waiting = true;
    if (n.id == playerId) n.waiting = true;
    if (!n.waiting) all_ok = false;
  })
  if (all_ok) {
    game.players.forEach(n => { n.waiting = false; })
    initHand();
    broadcastState("START");
  }
}

function pushNextHandButton() {
  if (game.phase !== "showdown") return;
  nextHand();
}
window.pushNextHandButton = pushNextHandButton;
