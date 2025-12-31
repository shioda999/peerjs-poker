// ui.js

const RANK_ORDER = ["A","2","3","4","5","6","7","8","9","T","J","Q","K"];
const SUIT_ORDER = ["s","h","d","c"];

let hover_button_act = "";

function getUIScale(el = document.documentElement) {
  const v = getComputedStyle(el).getPropertyValue("--ui-scale").trim();
  return v ? parseFloat(v) : 1;
}

function updateUI() {
  renderBoard();
  renderPlayers();
  renderInfo();
}

function renderBoard() {
  const board = document.getElementById("board");
  board.innerHTML = "";
  if (!game.board) return;
  game.board.forEach((c, i) => {
    const cd = cardDiv(c);
    if (game.board_animating[i]) cd.style.visibility = "hidden";
    board.appendChild(cd);
  });
}

function renderPlayers() {
  const root = document.getElementById("players");
  const root_me = document.getElementById("player-me");
  let me_div = null;
  root.innerHTML = "";
  root_me.innerHTML = "";
  if (!game.players) return;

  game.players.forEach((p, i) => {
    const isMe = is_me(p);
    const isTurn = game.turn === i;
    const d = document.createElement("div");
    d.className = "player" + (isMe ? " me" : "") + (p.folded ? " folded" : "");

    if (isTurn) d.classList.add("turn");
    else d.classList.remove("turn");

    // name
    const nameRow = document.createElement("div");
    nameRow.className = "player-name";
    nameRow.innerHTML = `
      <span class="player-name-text">${p.name}</span>
      ${isMe ? `<button class="lobby-btn" data-edit-name>✏️</button>` : ""}
    `;
      // ${game.phase !== "showdown" && isTurn ? `<span class="badge turn">TURN</span>` : ""}
    if (isMe) {
      const editBtn = nameRow.querySelector("[data-edit-name]");
      editBtn.onclick = () => openNameEditModal(p);
    }

    // stack/bet
    const stackBet = document.createElement("div");
    stackBet.className = "stack-bet";
    stackBet.innerHTML = `
      <div>Stack: ${Math.floor(p.stack)}</div>
      ${p.handResult ? `<span class="badge">${p.handResult}</span>` :`
      <div>
        Bet: <span class="bet-amount" data-player-index="${i}">${p.bet}</span>
        <span class="bet-diff" data-player-index="${i}"></span>
      </div>`}
    `;

    // hand
    const hand = document.createElement("div");
    hand.className = "hand";
    if (p.hand) {
      p.hand.forEach((c, ci) => {
        const isVisible = isMe || game.phase === "showdown";
        const cd = cardDiv(isVisible ? c : "??");
        if (p.hand_animating && p.hand_animating[ci] !== false) cd.style.visibility = "hidden";
        hand.appendChild(cd);
      });

      if (p.last_action && game.phase !== "showdown") {
        const act = document.createElement("div");
        act.className = "last-action";
        act.textContent = p.last_action.toUpperCase(); // fold → FOLD
        hand.appendChild(act);
      }
    }

    if (isMe) {
      // 自分は name 左上、hand 横に、stack-bet 右横
      const row = document.createElement("div");
      row.className = "player-row";
      row.appendChild(nameRow);
      row.appendChild(hand);
      row.appendChild(stackBet);
      d.appendChild(row);
      me_div = d;
    } else {
      // 他プレイヤーは縦配置で中央揃え
      d.appendChild(nameRow);
      d.appendChild(hand);
      d.appendChild(stackBet);
      root.appendChild(d);
    }
  });

  if (me_div) root_me.appendChild(me_div);
  updateBetDiff();
  positionLastActions();
}

function positionLastActions() {
  document.querySelectorAll(".hand").forEach(hand => {
    const act = hand.querySelector(".last-action");
    if (!act) return;

    const cards = Array.from(hand.querySelectorAll(".card"))
      .filter(c => c.offsetParent !== null); // hidden除外

    if (cards.length < 2) return;

    const r1 = cards[0].getBoundingClientRect();
    const r2 = cards[1].getBoundingClientRect();

    // 2枚の中央点（画面座標）
    const cx = (r1.left + r1.right + r2.left + r2.right) / 4;
    const cy = (r1.top + r1.bottom) / 2;

    // hand基準に変換
    act.style.left = cx + "px";
    act.style.top  = cy + "px";
    act.style.transform = "translate(-50%, -50%)";
  });
}

function renderInfo() {
  document.getElementById("pot").textContent = `Pot: ${game.pot}`;
  const phaseElem = document.getElementById("phase");
  if (game.phase != "showdown") {
    phaseElem.textContent = `Phase: ${game.phase}`;
    phaseElem.style.color = "white";  // ← 文字色を黄色に変更
  }
  else {
    phaseElem.textContent = game.result;
    phaseElem.style.color = "yellow";  // ← 文字色を黄色に変更
  }
  updateControlsVisibility();
}

function updateControlsVisibility() {
  const isShowdown = (game.phase === "showdown");

  // Call / Raise / Fold
  document.querySelectorAll("#controls [data-act]").forEach(btn => {
    btn.style.display = isShowdown ? "none" : "";
  });

  // NextHand
  const nextBtn = document.getElementById("next-hand");
  if (nextBtn) {
    if (isShowdown && nextBtn.style.display === "none"){
        nextBtn.textContent = "NextHand"
    }
    nextBtn.style.display = isShowdown ? "" : "none";
  }
}

function showBetDiff(act) {
  hover_button_act = act;
  updateBetDiff();
}

function updateBetDiff() {
  const act = hover_button_act;

  if (act === "fold") { clearBetDiff(); return; }

  const cost = getCostIfAct(act);

  const meIndex = game.players.findIndex(p => is_me(p));

  const diffSpan = document.querySelector(
    `.bet-diff[data-player-index="${meIndex}"]`
  );

  if (diffSpan) {
    diffSpan.textContent = ` (+${cost})`;
    diffSpan.classList.add("bet-diff-active");
  }
}

function clearBetDiff() {
  hover_button_act = "";
  const diffspan = document.querySelectorAll(".bet-diff");
  if (diffspan)
    diffspan.forEach(span => {
      span.textContent = "";
      span.classList.remove("bet-diff-active");
    });
}

function getCostIfAct(act) {
  const me = game.players.find(p => is_me(p));
  if (!me) return 0;

  const maxBet = Math.max(...game.players.map(p => p.bet));

  if (act === "call") {
    return Math.max(0, maxBet - me.bet);
  }

  if (act === "raise") {
    const raiseTo = maxBet + game.raiseAmount;
    return Math.max(0, raiseTo - me.bet);
  }

  return 0;
}

function cardToPosition(card) {
  return {
    col: RANK_ORDER.indexOf(card[0]),
    row: SUIT_ORDER.indexOf(card[1])
  };
}

function cardDiv(card) {
  const d = document.createElement("div");
  d.className = "card";

  if (card === "??") {
    d.classList.add("back");
    return d;
  }

  // 後で使うために card 情報を保持
  d.dataset.card = card;

  observeCardSize(d); // ← ここで仕込む
  return d;
}

const cardResizeObserver = new ResizeObserver(entries => {
  for (const entry of entries) {
    const el = entry.target;
    const card = el.dataset.card;
    if (!card) return;

    const { col, row } = cardToPosition(card);
    const { width: W, height: H } = entry.contentRect;
    const pos = `-${col * W}px -${row * H}px`;

    el.style.backgroundPosition = pos;
  }
});

function observeCardSize(cardEl) {
  cardResizeObserver.observe(cardEl);
}

function get_deck_pos() {
  const rect = document.getElementById("deck").getBoundingClientRect();
  return [rect.left, rect.top];
}

function animateDealBoard(cards_index, callback) {
  const boardDiv = document.getElementById("board");
  const [deckX, deckY] = get_deck_pos();

  cards_index.forEach(i => {
    const animCard = cardDiv("??");
    animCard.style.position = "fixed";
    animCard.style.left = deckX + "px";
    animCard.style.top = deckY + "px";
    animCard.style.zIndex = 2000 + i;
    animCard.style.transition = "all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)";
    animCard.style.visibility = "visible";

    document.body.appendChild(animCard);

    requestAnimationFrame(() => {
      const boardRect = boardDiv.children[i].getBoundingClientRect();
      animCard.style.left = boardRect.left + "px";
      animCard.style.top  = boardRect.top + "px";
    });

    setTimeout(() => {
      game.board_animating[i] = false;
      animCard.remove();
      if (callback) callback();
      updateUI();
    }, 800);
  });
}

function animateDealingHands(callback) {
  // 座標計算の前に一度最新の状態にする
  updateUI(); 

  const root = document.getElementById("players");
  const root_me = document.getElementById("player-me");
  const [deckX, deckY] = get_deck_pos();

  const cardsToDeal = [];
  let div_index = 0;

  game.players.forEach((p, pi) => {
    
    p.hand.forEach((_, ci) => {
      cardsToDeal.push({
        playerIndex: pi, 
        cardIndex: ci,
        div_index: div_index
      });
    });

    if (!is_me(p)) div_index++;
  });

  let finishedCount = 0;

  function dealNext(i) {
    if (i >= cardsToDeal.length) return;

    const { playerIndex, cardIndex, div_index } = cardsToDeal[i];
    const player = game.players[playerIndex];
    const animCard = cardDiv("??");
    animCard.style.position = "fixed"; // absoluteよりfixedが安全な場合が多い
    animCard.style.left = deckX + "px";
    animCard.style.top = deckY + "px";
    animCard.style.transformOrigin = "top left";
    animCard.style.zIndex = 1000 + i;
    animCard.style.transition = "all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)"; // 軌道を滑らかに

    document.body.appendChild(animCard);

    animCard.style.transform = `translate(0px, 0px) scale(1.0)`;
    requestAnimationFrame(() => {
      const playerDiv = is_me(player) ? root_me.children[0] : root.children[div_index];
      const handDiv = playerDiv.querySelector(".hand");
      const rect = handDiv.children[cardIndex].getBoundingClientRect();
      const style = getComputedStyle(handDiv);
      const cardScale = parseFloat(style.getPropertyValue("--card-scale")) || 1;
      animCard.style.transform =
        `translate(${rect.left - deckX}px, ${rect.top - deckY}px) scale(${cardScale})`;
    });

    setTimeout(() => {
      // 内部データの更新
      player.hand_animating[cardIndex] = false;
      animCard.remove();
      
      // 1枚配り終えるたびに再描画して、本来の場所にあるカードを表示させる
      updateUI();

      finishedCount++;
      if (finishedCount === cardsToDeal.length && callback) {
        callback();
      }
    }, 800);

    setTimeout(() => dealNext(i + 1), 100);
  }

  setTimeout(() => dealNext(0), 300);
}

/* controls */
const controls = document.getElementById("controls");

controls.addEventListener("mouseover", e => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;

  showBetDiff(btn.dataset.act);
});

controls.addEventListener("mouseout", e => {
  if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
  
  clearBetDiff();
});

controls.addEventListener("click", e=>{
  const act = e.target.dataset.act;
  if (act) window.pushActButton(act);
});

document.getElementById("next-hand").onclick = (e) => {
  const btn = e.currentTarget;

  btn.textContent = "waiting...";

  window.pushNextHandButton();
}
