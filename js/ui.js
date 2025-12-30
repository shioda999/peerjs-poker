// ui.js

const RANK_ORDER = ["A","2","3","4","5","6","7","8","9","T","J","Q","K"];
const SUIT_ORDER = ["s","h","d","c"];

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
  root.innerHTML = "";
  if (!game.players) return;

  game.players.forEach((p,i)=>{
    const d = document.createElement("div");
    const isMe = is_me(p);

    d.className = "player" +
      (is_me(p) ? " me":"") +
      (p.folded ? " folded":"");

    d.innerHTML = `
    <div class="name player-name-row">
      <span class="player-name-text">
      ${p.name}
      </span>
      ${game.phase !== "showdown" && game.turn === i ? `<span class="badge turn">TURN</span>` : ""}
      ${p.handResult ? `<span class="badge hand">${p.handResult}</span>` : ""}
      ${isMe ? `<button class="lobby-btn" data-edit-name>✏️</button>` : ""}
    </div>
    <div>Stack: ${p.stack}</div>
    <div>
      Bet:
      <span class="bet-amount" data-player-index="${i}">
        ${p.bet}
      </span>
      <span class="bet-diff" data-player-index="${i}"></span>
    </div>
    `;

    if (isMe) {
        const editBtn = d.querySelector("[data-edit-name]");
        editBtn.onclick = () => {
            openNameEditModal(p); // ← 既存の共通モーダル
        };
    }


    const hand = document.createElement("div");
    hand.className = "hand";

    if (!p.hand) return;
    p.hand.forEach((c, i) => {
        const isVisible = (is_me(p) || game.phase === "showdown");
        const cd = cardDiv(isVisible ? c : "??");
        
        // hand_animatingが明示的にfalseの時だけ表示、それ以外（trueやundefined）は隠す
        if (p.hand_animating && p.hand_animating[i] !== false) {
            cd.style.visibility = "hidden";
        }
        hand.appendChild(cd);
    });

    d.appendChild(hand);
    root.appendChild(d);
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
  if (act === "fold") { clearBetDiff(); return; }

  const cost = getCostIfAct(act);

  const meIndex = game.players.findIndex(p => is_me(p));

  const diffSpan = document.querySelector(
    `.bet-diff[data-player-index="${meIndex}"]`
  );

  diffSpan.textContent = ` (+${cost})`;
  diffSpan.classList.add("bet-diff-active");
}

function clearBetDiff() {
  document.querySelectorAll(".bet-diff").forEach(span => {
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

  const { col, row } = cardToPosition(card);
  const W = 60;
  const H = 84;

  d.style.backgroundPosition =
    `-${col * W}px -${row * H}px`;
  return d;
}

function get_deck_pos() {
  const rect = document.getElementById("deck").getBoundingClientRect();
  return [rect.left, rect.top];
}

function animateDealBoard(cards_index) {
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
      const boardRect = boardDiv.getBoundingClientRect();
      animCard.style.left = boardRect.left + i * 68 + "px";
      animCard.style.top  = boardRect.top + "px";
    });

    setTimeout(() => {
      game.board_animating[i] = false;
      animCard.remove();
      updateUI();
    }, 800);
  });
}

function animateDealingHands(callback) {
  const root = document.getElementById("players");
  const [deckX, deckY] = get_deck_pos();

  const cardsToDeal = [];
  // 座標計算の前に一度最新の状態にする
  updateUI(); 

  game.players.forEach((p, pi) => {
    
    p.hand.forEach((_, ci) => {
      cardsToDeal.push({ 
        playerIndex: pi, 
        cardIndex: ci,
      });
    });
  });

  let finishedCount = 0;

  function dealNext(i) {
    if (i >= cardsToDeal.length) return;

    const { playerIndex, cardIndex } = cardsToDeal[i];
    const animCard = cardDiv("??");
    animCard.style.position = "fixed"; // absoluteよりfixedが安全な場合が多い
    animCard.style.left = deckX + "px";
    animCard.style.top = deckY + "px";
    animCard.style.zIndex = 1000 + i;
    animCard.style.transition = "all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)"; // 軌道を滑らかに

    document.body.appendChild(animCard);

    requestAnimationFrame(() => {
      const playerDiv = root.children[playerIndex];
      const handDiv = playerDiv.querySelector(".hand");
      const rect = handDiv.getBoundingClientRect();
      animCard.style.left = rect.left + cardIndex * 65 + "px";
      animCard.style.top = rect.top  + "px";
    });

    setTimeout(() => {
      // 内部データの更新
      game.players[playerIndex].hand_animating[cardIndex] = false;
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

  dealNext(0);
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
