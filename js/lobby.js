let cpuCount = 0;

let myName = null;

function openNameModal({
  title = "名前を入力してください",
  initialValue = "",
  onSubmit
}) {
  const modal = document.getElementById("name-modal");
  const input = document.getElementById("name-input");
  const okBtn = document.getElementById("name-ok");
  const titleEl = document.getElementById("name-modal-title");

  titleEl.textContent = title;
  input.value = initialValue;

  modal.classList.remove("hidden");
  input.focus();

  const submit = () => {
    const value = input.value.trim() || "Player";
    modal.classList.add("hidden");
    onSubmit?.(value);
  };

  okBtn.onclick = submit;
  input.onkeydown = (e) => {
    if (e.key === "Enter") submit();
  };
}

function changeName(player, newName) {
  const is_me = player.id == player_id;
  if (is_me) myName = newName;
  if (isHost) {
    player.name = newName;
    broadcastState("RECONNECT");
    updateLobby(game.players);
    broadcastLobby();
  }
  else {
    if (is_me) send({ type: "JOIN", name: myName, id: player_id })
  }
}

function openNameEditModal(player) {
  openNameModal({
    title: "名前を変更",
    initialValue: player.name,
    onSubmit: (newName) => {
      changeName(player, newName);
    }
  });
}

function initLobby() {
  const roomFromURL = getRoomIdFromURL();

  if (roomFromURL)
    startAsClient();
  else
    startAsHost();
}

function showLobby() {
  document.getElementById("lobby").classList.remove("hidden");
  document.getElementById("table").classList.add("hidden");
}

function showTable() {
  document.getElementById("lobby").classList.add("hidden");
  document.getElementById("table").classList.remove("hidden");
}

function updateLobby(players) {
  const list = document.getElementById("player-list");
  list.innerHTML = "";

  players.forEach((p, idx) => {
    const li = document.createElement("li");
    li.textContent = `${p.name}`;
    // li.textContent = `${p.name} (${p.stack})`;

    if (p.id === player_id) {
      li.textContent += " [You]";
      li.classList.add("is-me");
    }
    // if (!p.isHuman) li.textContent += " 🤖";
    if (isHost && !p.isHuman || p.id === player_id) {
      
      if (!p.isHuman) {
        const delBtn = document.createElement("button");
        delBtn.textContent = "🗑️";
        delBtn.classList.add("lobby-btn");
        delBtn.onclick = () => removeCPUPlayer(p.id);
        li.appendChild(delBtn);
      }

      const editBtn = document.createElement("button");
      editBtn.textContent = "✏️";
      editBtn.classList.add("lobby-btn");
      editBtn.onclick = () => openNameEditModal(p);
      li.appendChild(editBtn);
    }

    list.appendChild(li);
  });
}

function getRoomIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("room");
}

function prepareLobby(roomId){
  const url = `${location.origin}${location.pathname}?room=${roomId}`;
  // navigator.clipboard.writeText(url);
  
  document.getElementById("room-id").textContent = roomId;
  const copyBtn = document.getElementById("copy-url");
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(url);
    copyBtn.textContent = "コピーしました！";

    setTimeout(() => {
      copyBtn.textContent = "招待URLをコピー";
    }, 1200);
  };

  if (isHost) {
    const btn = document.getElementById("start-game");
    btn.classList.remove("hidden")
    btn.onclick = () => {
      if (game.players.length >= 2){
        initStack();
        initHand();
        broadcastState("START");
      }
    };

    const cpuBtn = document.getElementById("add-cpu");
    cpuBtn.classList.remove("hidden");
    cpuBtn.onclick = addCPUPlayer;
  }
}

function addCPUPlayer() {
  if (!isHost) return;

  cpuCount++;
  const cpu = {
    name: `CPU${cpuCount} 🤖`,
    isHuman: false,
    isHost: false,
    stack: game.init_stack,
    id: `cpu-${Date.now()}`,
    Lv: 1,
  };

  game.players.push(cpu);
  updateLobby(game.players);
  broadcastLobby();
}

function removeCPUPlayer(cpuId) {
  if (!isHost) return;

  game.players = game.players.filter(p => p.id !== cpuId);
  updateLobby(game.players);
  broadcastLobby();
}

window.onload = () => {
  openNameModal({
    title: "名前を入力してください",
    initialValue: "",
    onSubmit: (name) => {
      myName = name;
      initLobby();
    }
  });
};