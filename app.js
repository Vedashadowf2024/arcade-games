import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const app = document.querySelector("#app");
const indicator = document.querySelector("#connection-indicator");
const CONFIG_KEY = "arcade-rooms-supabase-config";
const state = {
  client: null, channel: null, id: null, name: "Player", room: "",
  host: false, peer: null, stage: "home", selectedGame: "rps", rps: null, ttt: null,
};

const MOVES = ["rock", "paper", "scissors", "lizard", "spock"];
const ICONS = { rock: "✊", paper: "✋", scissors: "✌", lizard: "🦎", spock: "🖖" };
const BEATS = {
  rock: ["scissors", "lizard"], paper: ["rock", "spock"],
  scissors: ["paper", "lizard"], lizard: ["paper", "spock"],
  spock: ["rock", "scissors"],
};
const QUIZ = [
  { q: "Which planet is known as the Red Planet?", choices: ["Venus", "Mars", "Jupiter", "Mercury"], answer: "Mars" },
  { q: "How many sides does a hexagon have?", choices: ["Five", "Six", "Seven", "Eight"], answer: "Six" },
  { q: "What is the largest ocean on Earth?", choices: ["Atlantic", "Indian", "Arctic", "Pacific"], answer: "Pacific" },
  { q: "Which animal is the largest mammal?", choices: ["Elephant", "Blue whale", "Giraffe", "Orca"], answer: "Blue whale" },
  { q: "What is the chemical symbol for gold?", choices: ["Ag", "Go", "Au", "Gd"], answer: "Au" },
];

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function setOnline(online) {
  indicator.classList.toggle("online", online);
  indicator.innerHTML = `<i></i> ${online ? `ROOM ${esc(state.room)}` : "NOT CONNECTED"}`;
}

function home() {
  state.stage = "home";
  setOnline(false);
  app.innerHTML = `
    <section class="hero">
      <div class="eyebrow">A tiny arcade for two</div>
      <h1>Pick a game.<br><span class="accent">Bring a friend.</span></h1>
      <p>Meet in a private room and play head-to-head from anywhere.<br>Every match runs live while both players are connected.</p>
    </section>
    <section class="home-grid">
      <div class="panel">
        <h2>Connect to your arcade</h2>
        <p class="panel-intro">Enter your Supabase project details, then create or join a room.</p>
        <label class="field"><span>PLAYER NAME</span><input id="player-name" maxlength="20" placeholder="e.g. Alex" autocomplete="nickname"></label>
        <div class="two-fields">
          <label class="field"><span>SUPABASE PROJECT URL</span><input id="project-url" placeholder="https://your-project.supabase.co" autocomplete="url"></label>
          <label class="field"><span>PUBLIC CLIENT KEY</span><input id="project-key" placeholder="sb_publishable_..." autocomplete="off"></label>
        </div>
        <label class="field"><span>ROOM CODE <small>(for joining)</small></span><input id="room-input" maxlength="6" placeholder="Enter a friend's code" autocomplete="off"></label>
        <div class="button-row">
          <button id="create-room" class="button primary">Create a room</button>
          <button id="join-room" class="button secondary">Join room</button>
        </div>
        <p id="home-error" class="error"></p>
        <p class="tiny-note">The project URL and publishable key are saved in this browser for reconnecting. They are public client values; never enter a secret or service-role key.</p>
      </div>
      <div class="panel">
        <h2>Games in the room</h2>
        <p class="panel-intro">Choose a game together after your friend joins.</p>
        <div class="game-list">
          <div class="game-card"><div class="game-icon">✊</div><div><strong>Rock–Paper–Scissors</strong><span>Classic or Lizard–Spock rules</span></div><div class="tag">HEAD TO HEAD</div></div>
          <div class="game-card"><div class="game-icon">❎</div><div><strong>Tic-Tac-Toe</strong><span>Take turns on a shared 3 × 3 board</span></div><div class="tag">TURN BASED</div></div>
        </div>
        <div class="notice">Needs Supabase Realtime and anonymous sign-ins. To enable persistent match history, run <strong>supabase_schema.sql</strong> in your project's SQL Editor.</div>
      </div>
    </section>`;
  const savedConfig = readConfig();
  if (savedConfig) {
    document.querySelector("#project-url").value = savedConfig.url;
    document.querySelector("#project-key").value = savedConfig.key;
  }
  document.querySelector("#brand-home").onclick = (event) => { event.preventDefault(); disconnect(); home(); };
  document.querySelector("#home-button").onclick = () => { disconnect(); home(); };
  document.querySelector("#history-button").onclick = openHistory;
  document.querySelector("#create-room").onclick = () => beginConnection(true);
  document.querySelector("#join-room").onclick = () => beginConnection(false);
  document.querySelector("#room-input").addEventListener("input", (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });
}

function readConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null");
    return saved?.url && saved?.key ? saved : null;
  } catch { return null; }
}

function saveConfig(url, key) {
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, key })); }
  catch { /* The current connection still works if browser storage is unavailable. */ }
}

function makeClient(url, key) {
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
}

async function ensureIdentity(client) {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (sessionData.session?.user) return sessionData.session.user;
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw error;
  if (!data.user) throw new Error("Supabase did not create a player session.");
  return data.user;
}

async function openHistory() {
  let config = readConfig();
  const urlInput = document.querySelector("#project-url");
  const keyInput = document.querySelector("#project-key");
  if (!config && urlInput?.value.trim() && keyInput?.value.trim()) {
    config = { url: urlInput.value.trim().replace(/\/$/, ""), key: keyInput.value.trim() };
    saveConfig(config.url, config.key);
  }
  state.stage = "history";
  setOnline(Boolean(state.channel));
  app.innerHTML = `<section class="history-page"><div class="history-heading"><div><div class="eyebrow">Your arcade</div><h1>Game history</h1><p class="subtext">Loading your saved matches…</p></div><button id="history-home" class="button ghost">Back</button></div><p id="history-error" class="error"></p><div id="history-list" class="history-list"></div></section>`;
  document.querySelector("#history-home").onclick = () => { disconnect(); home(); };
  if (!config) {
    document.querySelector(".history-heading .subtext").textContent = "Connect your Supabase project to view saved matches.";
    return;
  }
  try {
    if (!state.client) state.client = makeClient(config.url, config.key);
    const user = await ensureIdentity(state.client);
    state.id = user.id;
    const { data, error } = await state.client
      .from("game_history")
      .select("game_id,opponent_name,game_type,variant,outcome,player_score,opponent_score,room_code,completed_at")
      .eq("user_id", state.id)
      .order("completed_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    renderHistory(data || []);
  } catch (error) {
    const box = document.querySelector("#history-error");
    if (box) box.textContent = `Could not load history: ${authErrorMessage(error)}. Check that the history SQL has been run in your Supabase project.`;
  }
}

function renderHistory(records) {
  const list = document.querySelector("#history-list");
  if (!list) return;
  if (!records.length) {
    list.innerHTML = `<div class="panel empty-history"><strong>No matches saved yet</strong>Your finished matches will appear here and stay linked to this browser.</div>`;
    return;
  }
  list.innerHTML = records.map((record) => {
    const game = record.game_type === "rps" ? "Rock–Paper–Scissors" : "Tic-Tac-Toe";
    const date = new Date(record.completed_at).toLocaleString();
    return `<article class="history-item">
      <div><strong>${game} · ${esc(record.variant)}</strong><p>vs ${esc(record.opponent_name)} · Score ${record.player_score}–${record.opponent_score} · Room ${esc(record.room_code)}</p></div>
      <span class="history-outcome ${esc(record.outcome)}">${esc(record.outcome)}</span>
      <time>${esc(date)}</time>
    </article>`;
  }).join("");
}

async function saveHistoryRecord(game, outcome, playerScore, opponentScore, variant) {
  const record = {
    game_id: game.gameId,
    user_id: state.id,
    opponent_id: state.peer.id,
    player_name: state.name,
    opponent_name: state.peer.name || (state.host ? "Player 2" : "Host"),
    game_type: game.type,
    variant,
    outcome,
    player_score: playerScore,
    opponent_score: opponentScore,
    room_code: state.room,
  };
  const { error } = await state.client.from("game_history").upsert(record, {
    onConflict: "game_id,user_id",
    ignoreDuplicates: true,
  });
  if (error) throw error;
}

async function persistFinishedGame(game, outcome, playerScore, opponentScore, variant) {
  if (game.historySaved || game.historySaving) return;
  game.historyArgs = { outcome, playerScore, opponentScore, variant };
  game.historySaving = true;
  game.historyError = "";
  try {
    await saveHistoryRecord(game, outcome, playerScore, opponentScore, variant);
    game.historySaved = true;
  } catch (error) {
    game.historyError = error.message || "Database insert failed.";
  } finally {
    game.historySaving = false;
    if (state.stage === "game" && (state.rps === game || state.ttt === game)) renderGame();
  }
}

function retryHistory(game) {
  if (game?.historyArgs) {
    const { outcome, playerScore, opponentScore, variant } = game.historyArgs;
    void persistFinishedGame(game, outcome, playerScore, opponentScore, variant);
  }
}

function homeError(message) {
  const box = document.querySelector("#home-error");
  if (box) box.textContent = message;
}

async function beginConnection(create) {
  const name = document.querySelector("#player-name").value.trim() || "Player";
  const url = document.querySelector("#project-url").value.trim().replace(/\/$/, "");
  const key = document.querySelector("#project-key").value.trim();
  const requestedRoom = document.querySelector("#room-input").value.trim().toUpperCase();
  if (!url.startsWith("https://") || !key) return homeError("Enter a valid HTTPS project URL and its public client key.");
  if (!create && requestedRoom.length !== 6) return homeError("Enter the six-character room code from your friend.");
  state.name = name.slice(0, 20);
  saveConfig(url, key);
  state.room = create ? randomCode() : requestedRoom;
  state.host = create;
  try {
    state.client = makeClient(url, key);
    const user = await ensureIdentity(state.client);
    state.id = user.id;
    await connectRoom();
  } catch (error) {
    homeError(`Could not connect: ${authErrorMessage(error)}`);
    disconnect();
  }
}

function authErrorMessage(error) {
  const message = error?.message || "check the project URL and public key";
  return message.includes("anonymous_provider_disabled") || message.toLowerCase().includes("anonymous")
    ? "Enable anonymous sign-ins in Supabase Authentication settings, then try again."
    : message;
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (value) => alphabet[value % alphabet.length]).join("");
}

async function connectRoom() {
  state.stage = "connecting";
  app.innerHTML = `<section class="game-view"><div class="panel"><div class="eyebrow">Connecting</div><h2>Opening room <span class="accent mono">${esc(state.room)}</span></h2><p class="subtext">Connecting to Supabase Realtime…</p><p id="connect-error" class="error"></p></div></section>`;
  const channel = state.client.channel(`arcade-room-${state.room}`, {
    config: { broadcast: { self: false }, presence: { key: state.id } },
  });
  state.channel = channel;
  channel
    .on("presence", { event: "sync" }, syncPlayers)
    .on("broadcast", { event: "game_start" }, ({ payload }) => receiveGameStart(payload))
    .on("broadcast", { event: "rps_rules" }, ({ payload }) => receiveRpsRules(payload))
    .on("broadcast", { event: "rps_move" }, ({ payload }) => receiveRpsMove(payload))
    .on("broadcast", { event: "rps_result" }, ({ payload }) => receiveRpsResult(payload))
    .on("broadcast", { event: "ttt_move" }, ({ payload }) => receiveTttMove(payload))
    .on("broadcast", { event: "ttt_reset" }, () => { if (state.host) resetTtt(); })
    .on("broadcast", { event: "ttt_state" }, ({ payload }) => receiveTttState(payload))
    .subscribe(async (status, error) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ id: state.id, name: state.name, host: state.host });
        setOnline(true);
        if (state.stage === "connecting") renderLobby();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        const message = error?.message || "Realtime channel could not be opened.";
        const box = document.querySelector("#connect-error");
        if (box) box.textContent = message;
        else if (state.stage === "home") homeError(message);
      }
    });
}

function currentPlayers() {
  if (!state.channel) return [];
  return Object.values(state.channel.presenceState()).flat().filter((player) => player?.id);
}

function syncPlayers() {
  const players = currentPlayers();
  state.peer = players.find((player) => player.id !== state.id) || null;
  if (state.stage === "lobby") renderLobby();
}

function renderLobby() {
  state.stage = "lobby";
  const players = currentPlayers();
  state.peer = players.find((player) => player.id !== state.id) || null;
  const ready = Boolean(state.peer);
  const hostPlayer = players.find((player) => player.host) || (state.host ? { name: state.name } : null);
  const guestPlayer = players.find((player) => !player.host) || (!state.host && ready ? { name: state.name } : null);
  app.innerHTML = `
    <section class="lobby">
      <div class="lobby-top"><div><div class="eyebrow">Room lobby</div><h1 style="font-size:40px">${state.host ? "Your room is ready." : "You're in."}</h1><p class="subtext">Share the code with one friend. Both players need to use the same Supabase project.</p></div><button id="leave" class="button ghost">Leave room</button></div>
      <div class="room-code"><div><small>SHARE THIS ROOM CODE</small><strong>${esc(state.room)}</strong></div><button id="copy-code" class="button secondary">Copy code</button></div>
      <div class="player-status">
        <div class="player-slot ${hostPlayer ? "ready" : ""}"><span>PLAYER 1 · HOST</span><strong><i></i>${hostPlayer ? `${esc(hostPlayer.name || "Host")}${state.host ? " (you)" : ""}` : "Connecting…"}</strong></div>
        <div class="player-slot ${guestPlayer ? "ready" : ""}"><span>PLAYER 2</span><strong><i></i>${guestPlayer ? `${esc(guestPlayer.name || "Player 2")}${!state.host ? " (you)" : ""}` : "Waiting for a friend…"}</strong></div>
      </div>
      ${state.host ? `<h2>Choose a game</h2><div class="game-choices">
        <button class="choice ${state.selectedGame === "rps" ? "selected" : ""}" data-game="rps"><strong>Rock–Paper–Scissors</strong><span>Classic or Lizard–Spock. First to 3 round wins.</span></button>
        <button class="choice ${state.selectedGame === "ttt" ? "selected" : ""}" data-game="ttt"><strong>Tic-Tac-Toe</strong><span>Take turns. Host is X, guest is O.</span></button>
      </div><button id="start-game" class="button primary full" ${ready ? "" : "disabled"}>Start game</button>` : `<div class="notice">Waiting for the host to start a game…</div>`}
      <p id="lobby-error" class="error"></p>
    </section>`;
  const leave = document.querySelector("#leave");
  leave.onclick = () => { disconnect(); home(); };
  document.querySelector("#copy-code").onclick = async (event) => {
    try { await navigator.clipboard.writeText(state.room); event.currentTarget.textContent = "Copied"; }
    catch { event.currentTarget.textContent = state.room; }
  };
  app.querySelectorAll("[data-game]").forEach((button) => button.onclick = () => {
    state.selectedGame = button.dataset.game;
    renderLobby();
  });
  const start = document.querySelector("#start-game");
  if (start) start.onclick = startSelectedGame;
}

function broadcast(event, payload) {
  if (state.channel) state.channel.send({ type: "broadcast", event, payload });
}

function startSelectedGame() {
  if (!state.peer) return;
  const type = state.selectedGame;
  const gameId = crypto.randomUUID();
  if (type === "rps") {
    state.ttt = null;
    state.rps = { type, gameId, historySaved: false, historyError: "", scores: { [state.id]: 0, [state.peer.id]: 0 }, move: null, peerMove: null, busy: false, finished: false, classic: true, last: "Choose your move." };
  } else {
    state.rps = null;
    state.ttt = { type, gameId, historySaved: false, historyError: "", board: Array(9).fill(""), turn: state.id, winner: "", draw: false };
  }
  broadcast("game_start", { type, gameId, host: state.id, guest: state.peer.id, hostName: state.name, guestName: state.peer.name || "Player 2" });
  state.stage = "game";
  renderGame();
}

function receiveGameStart(payload) {
  if (!payload || payload.host === state.id) return;
  state.peer = { id: payload.host, name: payload.hostName, host: true };
  if (payload.type === "rps") {
    state.ttt = null;
    state.rps = { type: payload.type, gameId: payload.gameId, historySaved: false, historyError: "", scores: { [payload.host]: 0, [state.id]: 0 }, move: null, peerMove: null, busy: false, finished: false, classic: true, last: "Choose your move." };
  }
  if (payload.type === "ttt") {
    state.rps = null;
    state.ttt = { type: payload.type, gameId: payload.gameId, historySaved: false, historyError: "", board: Array(9).fill(""), turn: payload.host, winner: "", draw: false };
  }
  state.stage = "game";
  renderGame();
}

function playerNames() {
  return state.host
    ? { me: state.name, peer: state.peer?.name || "Player 2" }
    : { me: state.name, peer: state.peer?.name || "Host" };
}

function renderGame() {
  if (state.stage !== "game") return;
  if (state.rps) renderRps();
  else if (state.ttt) renderTtt();
}

function renderRps() {
  const g = state.rps;
  const names = playerNames();
  const moves = g.classic ? MOVES.slice(0, 3) : MOVES;
  app.innerHTML = `
    <section class="game-view">
      <div class="eyebrow">Head to head · Room ${esc(state.room)}</div>
      <h1 class="game-title">Rock–Paper–Scissors</h1>
      <p class="rules">${g.classic ? "Classic rules" : "Lizard–Spock rules"} · First to 3 round wins</p>
      <div class="panel">
        <div class="score-row"><div class="score"><span>${esc(names.me)} · you</span><strong>${g.scores[state.id] || 0}</strong></div><div class="score"><span>${esc(names.peer)}</span><strong>${g.scores[state.peer?.id] || 0}</strong></div></div>
        <div class="game-status" id="game-status">${esc(g.last)}</div>
        <div class="move-grid">${moves.map(move => `<button class="move-button" data-move="${move}" ${g.move || g.busy || g.finished ? "disabled" : ""}>${ICONS[move]}<span>${move[0].toUpperCase() + move.slice(1)}</span></button>`).join("")}</div>
        <div class="button-row" style="justify-content:center"><button id="rules-toggle" class="button secondary">${g.classic ? "Switch to Lizard–Spock" : "Switch to Classic"}</button><button id="back-lobby" class="button ghost">Back to lobby</button></div>
        <p class="tiny-note">Each player submits a move privately. The result appears when both have chosen.</p>
        ${g.historySaving ? `<p class="tiny-note">Saving match to history…</p>` : g.historySaved ? `<p class="tiny-note">Match saved to your history.</p>` : ""}
        ${g.historyError ? `<p class="error">History save failed: ${esc(g.historyError)}</p><button id="retry-history" class="button secondary">Retry save</button>` : ""}
      </div>
    </section>`;
  app.querySelectorAll("[data-move]").forEach((button) => button.onclick = () => chooseRps(button.dataset.move));
  document.querySelector("#rules-toggle").onclick = () => {
    if (g.move || g.busy || g.finished || !state.host) return;
    g.classic = !g.classic;
    g.last = g.classic ? "Classic rules. Choose your move." : "Lizard–Spock rules. Choose your move.";
    broadcast("rps_rules", { classic: g.classic });
    renderRps();
  };
  if (!state.host || g.finished) document.querySelector("#rules-toggle").disabled = true;
  document.querySelector("#back-lobby").onclick = () => { state.rps = null; state.ttt = null; renderLobby(); };
  const retry = document.querySelector("#retry-history");
  if (retry) retry.onclick = () => retryHistory(g);
}

function chooseRps(move) {
  const g = state.rps;
  if (!g || g.move || g.busy) return;
  g.move = move;
  g.last = "Move locked in. Waiting for your opponent…";
  broadcast("rps_move", { sender: state.id, move });
  if (state.host && g.peerMove) resolveRps(g.peerMove);
  renderRps();
}

function receiveRpsRules(payload) {
  if (!state.rps || typeof payload?.classic !== "boolean") return;
  state.rps.classic = payload.classic;
  state.rps.last = payload.classic ? "Classic rules. Choose your move." : "Lizard–Spock rules. Choose your move.";
  renderRps();
}

function receiveRpsMove(payload) {
  const g = state.rps;
  if (!state.host || !g || payload.sender === state.id || !MOVES.includes(payload.move)) return;
  if (g.move) resolveRps(payload.move);
  else g.peerMove = payload.move;
}

function resolveRps(peerMove) {
  const g = state.rps;
  if (!g || !state.host || g.busy || !g.move) return;
  g.busy = true;
  g.peerMove = null;
  const mine = g.move;
  const winner = mine === peerMove ? "draw" : BEATS[mine].includes(peerMove) ? state.id : state.peer.id;
  if (winner !== "draw") g.scores[winner] = (g.scores[winner] || 0) + 1;
  const payload = { host: state.id, hostMove: mine, guestMove: peerMove, winner, scores: g.scores };
  receiveRpsResult(payload);
  broadcast("rps_result", payload);
}

function receiveRpsResult(payload) {
  const g = state.rps;
  if (!g || (payload.host && payload.host !== (state.host ? state.id : state.peer?.id))) return;
  g.scores = payload.scores;
  const mine = state.host ? payload.hostMove : payload.guestMove;
  const theirs = state.host ? payload.guestMove : payload.hostMove;
  if (payload.winner === "draw") g.last = `Tie round: ${mine} and ${theirs}.`;
  else g.last = payload.winner === state.id ? `You win the round: ${mine} beats ${theirs}!` : `${mine} vs ${theirs} — your opponent wins.`;
  if (g.scores[payload.winner] >= 3) {
    g.finished = true;
    g.last = payload.winner === state.id ? "You win the match!" : "Your opponent wins the match.";
    const outcome = payload.winner === state.id ? "win" : "loss";
    void persistFinishedGame(g, outcome, g.scores[state.id] || 0, g.scores[state.peer?.id] || 0, g.classic ? "Classic" : "Lizard-Spock");
  }
  g.move = null;
  g.busy = false;
  renderRps();
}

function renderTtt() {
  const g = state.ttt;
  const names = playerNames();
  const mark = state.host ? "X" : "O";
  const turnName = g.turn === state.id ? "Your turn" : `${esc(names.peer)} is playing…`;
  const status = g.winner ? (g.winner === state.id ? "You win!" : "Your opponent wins!") : g.draw ? "It's a draw!" : turnName;
  app.innerHTML = `
    <section class="game-view">
      <div class="eyebrow">Turn based · Room ${esc(state.room)}</div><h1 class="game-title">Tic-Tac-Toe</h1>
      <p class="rules">You are ${mark} · ${esc(names.me)} ${state.host ? "(host)" : ""} vs ${esc(names.peer)} ${state.host ? "" : "(host)"}</p>
      <div class="panel"><div class="game-status" id="game-status">${status}</div>
        <div class="board">${g.board.map((cell, i) => `<button class="cell ${cell.toLowerCase()}" data-cell="${i}" ${cell || g.winner || g.draw || g.turn !== state.id ? "disabled" : ""}>${cell}</button>`).join("")}</div>
        <div class="button-row" style="justify-content:center"><button id="new-board" class="button primary" ${g.winner || g.draw ? "" : "disabled"}>Play again</button><button id="back-lobby" class="button ghost">Back to lobby</button></div>
        ${g.historySaving ? `<p class="tiny-note">Saving match to history…</p>` : g.historySaved ? `<p class="tiny-note">Match saved to your history.</p>` : ""}
        ${g.historyError ? `<p class="error">History save failed: ${esc(g.historyError)}</p><button id="retry-history" class="button secondary">Retry save</button>` : ""}
      </div>
    </section>`;
  app.querySelectorAll("[data-cell]").forEach(button => button.onclick = () => clickCell(Number(button.dataset.cell)));
  document.querySelector("#new-board").onclick = () => {
    if (state.host) resetTtt();
    else broadcast("ttt_reset", { sender: state.id });
  };
  document.querySelector("#back-lobby").onclick = () => { state.ttt = null; state.rps = null; renderLobby(); };
  const retry = document.querySelector("#retry-history");
  if (retry) retry.onclick = () => retryHistory(g);
}

function clickCell(index) {
  if (!state.ttt || state.ttt.turn !== state.id || state.ttt.board[index] || state.ttt.winner || state.ttt.draw) return;
  if (state.host) {
    applyTttMove(index, state.id);
    broadcast("ttt_state", state.ttt);
  } else broadcast("ttt_move", { sender: state.id, index });
}

function receiveTttMove(payload) {
  if (!state.host || !state.ttt || payload.sender === state.id || state.ttt.turn !== payload.sender) return;
  const index = Number(payload.index);
  if (!Number.isInteger(index) || index < 0 || index > 8 || state.ttt.board[index] || state.ttt.winner || state.ttt.draw) return;
  applyTttMove(index, payload.sender);
  broadcast("ttt_state", state.ttt);
}

function applyTttMove(index, playerId) {
  const g = state.ttt;
  if (!g || playerId !== g.turn) return;
  g.board[index] = playerId === (state.host ? state.id : state.peer?.id) ? "X" : "O";
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const line = lines.find(([a,b,c]) => g.board[a] && g.board[a] === g.board[b] && g.board[b] === g.board[c]);
  if (line) g.winner = playerId;
  else if (g.board.every(Boolean)) g.draw = true;
  else g.turn = playerId === state.id ? state.peer.id : state.id;
  if (g.winner || g.draw) {
    const outcome = g.draw ? "draw" : g.winner === state.id ? "win" : "loss";
    void persistFinishedGame(g, outcome, g.winner === state.id ? 1 : 0, g.winner === state.peer?.id ? 1 : 0, "3x3");
  }
  renderTtt();
}

function receiveTttState(payload) {
  if (!state.host && payload?.board?.length === 9) {
    const sameGame = state.ttt?.gameId === payload.gameId;
    state.ttt = {
      type: payload.type,
      gameId: payload.gameId,
      board: payload.board,
      turn: payload.turn,
      winner: payload.winner,
      draw: payload.draw,
      historySaved: sameGame ? state.ttt.historySaved : false,
      historySaving: sameGame ? state.ttt.historySaving : false,
      historyError: sameGame ? state.ttt.historyError : "",
      historyArgs: sameGame ? state.ttt.historyArgs : null,
    };
    if (state.ttt.winner || state.ttt.draw) {
      const outcome = state.ttt.draw ? "draw" : state.ttt.winner === state.id ? "win" : "loss";
      void persistFinishedGame(state.ttt, outcome, state.ttt.winner === state.id ? 1 : 0, state.ttt.winner === state.peer?.id ? 1 : 0, "3x3");
    }
    renderTtt();
  }
}

function resetTtt() {
  if (!state.ttt) return;
  state.ttt = { type: "ttt", gameId: crypto.randomUUID(), historySaved: false, historyError: "", board: Array(9).fill(""), turn: state.id, winner: "", draw: false };
  renderTtt();
  if (state.host) broadcast("ttt_state", state.ttt);
}

function disconnect() {
  if (state.channel) state.client?.removeChannel(state.channel);
  state.channel = null;
  state.client = null;
  state.peer = null;
  state.rps = null;
  state.ttt = null;
  state.room = "";
  state.host = false;
  state.stage = "home";
}

document.querySelector("#home-button").onclick = () => { disconnect(); home(); };
document.querySelector("#brand-home").onclick = (event) => { event.preventDefault(); disconnect(); home(); };
home();
