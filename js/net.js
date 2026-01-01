// net.js
let peer;
let connections = [];
let isHost;
const player_id = localStorage.getItem("player_id") || crypto.randomUUID();
localStorage.setItem("player_id", player_id);

function startAsHost() {
  isHost = true;
  peer = new Peer();

  // 自分自身を登録
  game.players.length = 0;
  game.players.push({
    name: myName,
    isHuman: true,
    isHost: true,
    stack: game.init_stack,
    id: player_id
  });
  updateLobby(game.players);

  peer.on("open", id => prepareLobby(id));

  peer.on("connection", conn => {
    connections.push(conn);
    conn.on("data", onReceiveHost);

    // 新規参加者へ現在のロビー情報を送る
    sendLobbyState(conn);
  });
}

function startAsClient() {
  isHost = false;
  peer = new Peer();

  peer.on("open", () => {
    const roomId = getRoomIdFromURL();
    const conn = peer.connect(roomId);
    prepareLobby(roomId);

    conn.on("open", () => {
      conn.send({
        type: "JOIN",
        name: myName,
        id: player_id
      });
    });

    conn.on("data", onReceiveClient);

    conn.on("close", () => {
      onHostDisconnected("connection closed");
    });

    conn.on("error", err => {
      onHostDisconnected(err);
    });
    connections = [conn];
  });

  // PeerJS レベルでの切断（回線断・F5など）
  peer.on("disconnected", () => {
    onHostDisconnected("peer disconnected");
  });
  peer.on("error", err => {
    onHostDisconnected(err);
  });
}

function onReceiveHost(msg) {
  if (msg.type === "JOIN") {
    let p = game.players.find(pl => pl.id === msg.id);
    const is_lobby = document.getElementById("table").classList.contains("hidden");
    if (p) {
      p.name = msg.name;
    }
    if (!p) {
      const new_player = {
        name: msg.name,
        isHuman: true,
        isHost: false,
        stack: 1000,
        id: msg.id
      };
      if (is_lobby) game.players.push(new_player);
      else game.waiting_players.push(new_player);
    }
    broadcastState("RECONNECT");
    updateLobby(game.players);
    broadcastLobby();
  }
  if (msg.type == "ACT") {
    act(msg.action, msg.playerId, msg.raiseAmount);
  }
  if (msg.type == "NEXT_HAND") {
    playerNextHand(msg.playerId);
  }
}

function onReceiveClient(msg) {
  if (msg.type === "LOBBY") {
    updateLobby(msg.players);
  }
  if (msg.type === "STATE") {
    game = msg.game;
    showTable();
    dealGameProc(msg.event);
  }
}

function broadcastState(event="") {
  const is_lobby = document.getElementById("table").classList.contains("hidden");
  if (!isHost || is_lobby && event !== "START") return;
  const data = {
    type: "STATE",
    event: event,
    game
  };
  connections.forEach(c => c.send(data));
  showTable();
  dealGameProc(event);
}

function broadcastLobby() {
  const is_lobby = document.getElementById("table").classList.contains("hidden");
  if (!isHost || !is_lobby) return;
  const data = {
    type: "LOBBY",
    players: game.players
  };

  connections.forEach(c => c.send(data));
}

function sendLobbyState(conn) {
  conn.send({
    type: "LOBBY",
    players: game.players
  });
  updateLobby(game.players);
}

function send(data) {
  if (isHost) return;
  connections.forEach(c => c.send(data));
}

function onHostDisconnected(reason = "") {
  console.error("Host disconnected", reason);
  alert("ホストとの接続が切れました。\nページを再読み込みしてください。");
}
