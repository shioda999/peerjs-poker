function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function decideCpuAction(p) {
  // return cpuMoveSmart(p);
  switch (p.Lv) {
    case 0:
      return cpuMoveLv0(p);
    case 1:
      return cpuMoveSmart(p);
    default:
      return cpuMoveSmart(p);
  }
}

async function cpuMove(p, time=null) {
  if (!time) time = Math.min(500, 2000 / game.players.length)
  // 実行条件チェック
  if (
    game.phase === "showdown" ||
    game.players[game.turn] !== p ||
    p.folded
  ) {
    return;
  }

  const startTime = performance.now();

  // action 決定
  const action = decideCpuAction(p);

  const endTime = performance.now();
  const elapsed = endTime - startTime;

  // 最低 0.5 秒待つ
  const waitTime = Math.max(0, time - elapsed);
  if (waitTime > 0) {
    await sleep(waitTime);
  }

  // action 実行
  switch (action) {
    case "fold":
      fold(p);
      break;
    case "call":
      call(p);
      break;
    default:
      raise(p, game.raiseAmount);
      break;
  }

  nextTurn();
}

function cpuMoveLv0(p) {
  const r = Math.random();
  if (r < 0.) {
    return "fold"
  } else if (r < 0.9) {
    return "call"
  } else {
    return "raise"
  }
}

function getBoard(board, phase) {
  let v = 0;
  if (phase === "flop") v = 3;
  if (phase === "turn") v = 4;
  if (phase === "river") v = 5;
  return board.slice(0, v);
}

function cpuMoveSmart(p, lv=1) {
  const trials = game.phase == "river" ? 3000 : 800;
  const board = getBoard(game.board, game.phase);
  const winRate = estimateWinRate(p.hand, board, trials);
  // console.log(winRate)

  if (!potOddsOk(p, winRate)) return "fold"

  const evs = [
    { act: "fold", v: evFold() },
    { act: "call", v: evCall(p, winRate) },
    { act: "raise", v: evRaise(p, winRate, game.raiseAmount) }
  ];
  // console.log(evs)

  return pickAction(evs);
}

function pickAction(evs) {
  // EV降順
  evs.sort((a, b) => b.v - a.v);

  // 最大EVが raise でない → 確定
  if (evs[0].act !== "raise") {
    return evs[0].act;
  }

  if (Math.random() < 0.15) return "call";

  if (game.raiseCount >= 8) return "call";

  // raise が最大EVのときだけ softmax
  // ★ fold を除外
  const candidates = evs.filter(e => e.act !== "fold");

  const max = Math.max(...candidates.map(e => e.v));
  const temp = 0.7; // 小さいほど raise が出にくくなる

  const weights = candidates.map(e =>
    Math.exp((e.v - max) / temp)
  );

  const sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;

  for (let i = 0; i < candidates.length; i++) {
    if ((r -= weights[i]) <= 0) {
      return candidates[i].act;
    }
  }

  return candidates[0].act;
}

function evCall(p, winRate) {
  const baseCost = calcCost(p);
  const potAfterCall = game.pot + baseCost;

  return winRate * potAfterCall - (1 - winRate) * baseCost;
}

function evFold() {
  return 0;
}

function evRaise(p, winRate, raiseAmount) {
  const baseCost = calcCost(p);
  const cost = baseCost + raiseAmount;

  const pot = game.pot;
  const potAfterCall = pot + cost * 2;

  const baseFoldProb = estimateFoldProb(raiseAmount);
  const oppCount = game.players.filter(x => !x.folded && x !== p).length;
  let foldProb = baseFoldProb ** oppCount;

  const reRaiseProb = Math.min(1.0, 0.2 + raiseAmount / (pot + 1));
  const reRaisePenalty = reRaiseProb * cost * 1.5;

  if (game.phase === "river") foldProb *= 0.7;

  const ev =
      foldProb * pot
    + (1 - foldProb) * (
          winRate * potAfterCall
        - (1 - winRate) * cost
      ) - reRaisePenalty;

  return ev;
}

function calcCost(p) {
  const callCost = game.currentBet - p.bet;
  return callCost;
}

function estimateFoldProb(raiseAmount) {
  return 0.1;
  // const pot = game.pot;
  // const betRatio = raiseAmount / (pot + 1);
  // return Math.min(0.6, 0.15 + betRatio);
}

function fisher_yates_shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function estimateWinRate(myHand, board, trials = 1000) {
  let wins = 0;
  let ties = 0;
  let remaining_deck = getRemainingDeck(myHand, board, game.phase);
  // console.log(remaining_deck)

  for (let i = 0; i < trials; i++) {
    const deck = fisher_yates_shuffle([...remaining_deck]);

    const oppHand = [deck.pop(), deck.pop()];

    const fullBoard = [...board];
    while (fullBoard.length < 5) {
      fullBoard.push(deck.pop());
    }

    const my = Hand.solve([...myHand, ...fullBoard]);
    const opp = Hand.solve([...oppHand, ...fullBoard]);

    const result = Hand.winners([my, opp]);

    if (result.length === 2) ties++;
    else if (result[0] === my) wins++;
  }

  return adjustedWinRate((wins + ties * 0.5) / trials, game.phase);
}

function adjustedWinRate(winRate, phase) {
  let factor = 1;
  let factor2 = 1 / (game.raiseCount + 1);
  if (phase === "flop") factor = 0.7;
  if (phase === "turn") factor = 0.85;
  return factor * winRate * factor2 / (1 - winRate + winRate * factor2);
}

function potOddsOk(p, winRate) {
  const cost = game.currentBet - p.bet;
  return winRate > cost / (game.pot + cost);
}

function getRemainingDeck(myHand, board) {
  const used = [...myHand, ...board];
  return makeDeck().filter(c => !used.includes(c));
}