const ROWS = 6;
const DEFAULT_WORD_LENGTH = 5;
const MIN_WORD_LENGTH = 3;
const MAX_WORD_LENGTH = 15;
const TILE_FLIP_DELAY_MS = 220;
const TILE_FLIP_DURATION_MS = 420;
const CONFETTI_COLORS = ["#538d4e", "#b59f3b", "#6aa7ff", "#f78166", "#d977ff", "#f8f8f8"];
const STATS_STORAGE_KEY = "letterforge-stats-v1";
const THEME_STORAGE_KEY = "letterforge-theme-v1";
const CHALLENGE_PARAM_KEY = "challenge";

const gridEl = document.getElementById("grid");
const keyboardEl = document.getElementById("keyboard");
const messageEl = document.getElementById("message");
const newGameBtn = document.getElementById("new-game-btn");
const readyBtn = document.getElementById("ready-btn");
const levelSelectEl = document.getElementById("level-select");
const themeSelectEl = document.getElementById("theme-select");
const statsEl = document.getElementById("stats");
const timerEl = document.getElementById("timer");
const realtimeStatusEl = document.getElementById("realtime-status");
const confettiLayerEl = document.getElementById("confetti-layer");
const helpBtn = document.getElementById("help-btn");
const vsBtn = document.getElementById("vs-btn");
const shareBtn = document.getElementById("share-btn");
const helpModalEl = document.getElementById("help-modal");
const closeHelpBtn = document.getElementById("close-help-btn");

const dictionaryCache = new Map();

let currentRow = 0;
let currentCol = 0;
let gameOver = false;
let isSubmitting = false;
let isReady = false;
let answer = "";
let currentGameWon = false;
let currentWordLength = DEFAULT_WORD_LENGTH;
let activeChallengeWord = "";
let peerInstance = null;
let peerConnection = null;
let myPeerId = "";
let hostPeerId = "";
let isRealtimeMode = false;
let isHostRole = false;
let opponentConnected = false;
let localRematchRequested = false;
let remoteRematchRequested = false;
let localReadyToStart = false;
let remoteReadyToStart = false;
let isCountdownActive = false;
let localFinishedPayload = null;
let remoteFinishedPayload = null;
let realtimeRoundScored = false;
let timerIntervalId = null;
let gameStartMs = 0;
let guesses = [];
const tileRefs = [];
const rowRefs = [];
const keyRefs = new Map();
const revealHistory = [];
const sessionStats = loadStats();
const realtimeStats = createDefaultRealtimeStats();

void init();

async function init() {
  loadChallengeFromUrl();
  initRealtime();
  buildKeyboard();
  applySavedTheme();
  updateStatsDisplay();
  updateChallengeUi();
  updateRealtimeStatus(isRealtimeMode ? "Connecting to opponent..." : "");
  updateTimer(0);
  newGameBtn.addEventListener("click", () => {
    void startNewGame();
  });
  levelSelectEl.addEventListener("change", () => {
    void handleLevelChange();
  });
  themeSelectEl.addEventListener("change", () => {
    applyTheme(themeSelectEl.value, true);
  });
  readyBtn.addEventListener("click", () => {
    void handleReadyClick();
  });
  helpBtn.addEventListener("click", openHelpModal);
  vsBtn.addEventListener("click", () => {
    void handleVsButton();
  });
  closeHelpBtn.addEventListener("click", closeHelpModal);
  shareBtn.addEventListener("click", () => {
    void shareResults();
  });
  helpModalEl.addEventListener("click", (event) => {
    if (event.target === helpModalEl) {
      closeHelpModal();
    }
  });
  window.addEventListener("keydown", onPhysicalKey);
  if (isRealtimeMode) {
    currentWordLength = activeChallengeWord ? activeChallengeWord.length : resolveCurrentWordLength();
    buildGrid();
    resetBoard();
    isReady = false;
    showMessage("Connecting to opponent...");
    updateRealtimeStatus("Connecting to opponent...");
    updateChallengeUi();
  } else {
    await startNewGame();
  }
}

function buildGrid() {
  gridEl.innerHTML = "";
  gridEl.style.setProperty("--cols", String(currentWordLength));
  rowRefs.length = 0;
  tileRefs.length = 0;

  for (let r = 0; r < ROWS; r += 1) {
    const rowEl = document.createElement("div");
    rowEl.className = "row";
    const rowTiles = [];

    for (let c = 0; c < currentWordLength; c += 1) {
      const tile = document.createElement("div");
      tile.className = "tile";
      rowEl.appendChild(tile);
      rowTiles.push(tile);
    }

    rowRefs.push(rowEl);
    tileRefs.push(rowTiles);
    gridEl.appendChild(rowEl);
  }
}

function buildKeyboard() {
  const rows = [
    [..."qwertyuiop"],
    [..."asdfghjkl"],
    ["enter", ..."zxcvbnm", "back"],
  ];

  rows.forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "keyboard-row";

    row.forEach((keyValue) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "key";
      btn.textContent = keyValue === "back" ? "Back" : keyValue;
      btn.dataset.key = keyValue;

      if (keyValue === "enter" || keyValue === "back") {
        btn.classList.add("large");
      }

      btn.addEventListener("click", () => handleInput(keyValue));
      rowEl.appendChild(btn);
      keyRefs.set(keyValue, btn);
    });

    keyboardEl.appendChild(rowEl);
  });
}

function onPhysicalKey(event) {
  if (event.key === "Escape" && !helpModalEl.classList.contains("hidden")) {
    closeHelpModal();
    return;
  }

  if (!helpModalEl.classList.contains("hidden")) {
    return;
  }

  if (gameOver || isSubmitting || !isReady) {
    return;
  }

  const key = event.key.toLowerCase();
  if (/^[a-z]$/.test(key)) {
    event.preventDefault();
    handleInput(key);
  } else if (key === "backspace") {
    event.preventDefault();
    handleInput("back");
  } else if (key === "enter") {
    event.preventDefault();
    handleInput("enter");
  }
}

function handleInput(key) {
  if (!helpModalEl.classList.contains("hidden")) {
    return;
  }

  if (gameOver || isSubmitting || !isReady) {
    return;
  }

  if (key === "back") {
    removeLetter();
    return;
  }

  if (key === "enter") {
    submitGuess();
    return;
  }

  if (/^[a-z]$/.test(key)) {
    addLetter(key);
  }
}

function addLetter(letter) {
  if (currentCol >= currentWordLength) {
    return;
  }

  guesses[currentRow][currentCol] = letter;
  const tile = tileRefs[currentRow][currentCol];
  tile.textContent = letter;
  tile.classList.add("filled");
  tile.classList.remove("pop");
  void tile.offsetWidth;
  tile.classList.add("pop");
  currentCol += 1;
}

function removeLetter() {
  if (currentCol <= 0) {
    return;
  }

  currentCol -= 1;
  guesses[currentRow][currentCol] = "";
  const tile = tileRefs[currentRow][currentCol];
  tile.textContent = "";
  tile.classList.remove("filled");
}

async function submitGuess() {
  if (isSubmitting) {
    return;
  }

  if (!isReady) {
    showMessage("Still loading word...");
    return;
  }

  if (currentCol < currentWordLength) {
    showMessage("Not enough letters");
    shakeRow(currentRow);
    return;
  }

  isSubmitting = true;
  const guess = guesses[currentRow].join("");
  const wordValidation = await validateWord(guess);
  if (wordValidation === "invalid") {
    showMessage("Word does not exist");
    shakeRow(currentRow);
    isSubmitting = false;
    return;
  }

  if (wordValidation === "error") {
    showMessage("Unable to verify word. Check connection and try again.");
    isSubmitting = false;
    return;
  }

  const result = evaluateGuess(guess, answer);
  revealHistory.push([...result]);
  await colorRow(currentRow, result, guess);

  if (guess === answer) {
    currentGameWon = true;
    if (!isRealtimeMode) {
      finalizeGameStats(true);
    }
    gameOver = true;
    stopTimer();
    showMessage(`You win! Guessed in ${currentRow + 1} ${currentRow + 1 === 1 ? "guess" : "guesses"}.`, true);
    launchConfetti();
    publishFinish(true, currentRow + 1);
    isSubmitting = false;
    return;
  }

  currentRow += 1;
  currentCol = 0;

  if (currentRow >= ROWS) {
    if (!isRealtimeMode) {
      finalizeGameStats(false);
    }
    gameOver = true;
    stopTimer();
    showMessage(`Game over. Word was ${answer.toUpperCase()}`);
    publishFinish(false, ROWS);
  } else {
    showMessage("");
  }

  isSubmitting = false;
}

async function validateWord(guess) {
  if (dictionaryCache.has(guess)) {
    return dictionaryCache.get(guess) ? "valid" : "invalid";
  }

  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${guess}`);
    const isValid = response.ok;
    dictionaryCache.set(guess, isValid);
    return isValid ? "valid" : "invalid";
  } catch (_error) {
    return "error";
  }
}

async function getRandomDictionaryWord(wordLength) {
  const rounds = 6;
  const batchSize = 120;

  for (let round = 0; round < rounds; round += 1) {
    const candidates = await fetchRandomWordBatch(batchSize, wordLength);
    for (const candidate of shuffle(candidates)) {
      const result = await validateWord(candidate);
      if (result === "valid") {
        return candidate;
      }
    }
  }

  throw new Error("Unable to fetch a valid random word.");
}

async function fetchRandomWordBatch(batchSize, wordLength) {
  const pattern = "?".repeat(wordLength);
  const url = `https://api.datamuse.com/words?sp=${pattern}&max=${batchSize}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return [];
    }
    const entries = await response.json();
    if (!Array.isArray(entries)) {
      return [];
    }
    return entries
      .map((entry) => String(entry.word || "").toLowerCase())
      .filter((word) => word.length === wordLength && /^[a-z]+$/.test(word));
  } catch (_error) {
    return [];
  }
}

function evaluateGuess(guess, target) {
  const wordLength = target.length;
  const states = Array(wordLength).fill("absent");
  const remaining = {};

  for (let i = 0; i < wordLength; i += 1) {
    const t = target[i];
    remaining[t] = (remaining[t] || 0) + 1;
  }

  for (let i = 0; i < wordLength; i += 1) {
    if (guess[i] === target[i]) {
      states[i] = "correct";
      remaining[guess[i]] -= 1;
    }
  }

  for (let i = 0; i < wordLength; i += 1) {
    const ch = guess[i];
    if (states[i] === "correct") {
      continue;
    }
    if (remaining[ch] > 0) {
      states[i] = "present";
      remaining[ch] -= 1;
    }
  }

  return states;
}

function colorRow(rowIndex, states, guess) {
  return new Promise((resolve) => {
    states.forEach((state, i) => {
      const tile = tileRefs[rowIndex][i];
      setTimeout(() => {
        tile.classList.remove("flip");
        void tile.offsetWidth;
        tile.classList.add("flip");
        tile.classList.add(state);
        updateKeyState(guess[i], state);
      }, i * TILE_FLIP_DELAY_MS);
    });

    const totalTime = TILE_FLIP_DELAY_MS * (states.length - 1) + TILE_FLIP_DURATION_MS + 80;
    setTimeout(resolve, totalTime);
  });
}

function updateKeyState(letter, state) {
  const key = keyRefs.get(letter);
  if (!key) {
    return;
  }

  const priority = { correct: 3, present: 2, absent: 1 };
  const prevState = key.dataset.state || "";
  if (priority[state] > (priority[prevState] || 0)) {
    if (prevState) {
      key.classList.remove(prevState);
    }
    key.classList.add(state);
    key.dataset.state = state;
  }
}

function showMessage(text, isWin = false) {
  messageEl.classList.remove("win-bounce");
  if (isWin) {
    void messageEl.offsetWidth;
    messageEl.classList.add("win-bounce");
  }
  messageEl.textContent = text;
}

function updateStatsDisplay() {
  if (isRealtimeMode) {
    const winPercent = realtimeStats.played > 0
      ? Math.round((realtimeStats.won / realtimeStats.played) * 100)
      : 0;
    statsEl.textContent = `1v1 Played: ${realtimeStats.played} | Win%: ${winPercent} | W:${realtimeStats.won} L:${realtimeStats.losses} T:${realtimeStats.ties}`;
    return;
  }

  const winPercent = sessionStats.played > 0
    ? Math.round((sessionStats.won / sessionStats.played) * 100)
    : 0;
  statsEl.textContent = `Played: ${sessionStats.played} | Win%: ${winPercent} | Streak: ${sessionStats.currentStreak}`;
}

async function startNewGame() {
  if (isSubmitting) {
    return;
  }

  if (isRealtimeMode) {
    requestRematch();
    return;
  }

  currentWordLength = activeChallengeWord ? activeChallengeWord.length : resolveCurrentWordLength();
  buildGrid();
  resetBoard();
  await loadAnswerWord();
}

async function loadAnswerWord() {
  isReady = false;
  gameOver = false;
  currentGameWon = false;
  stopTimer();
  updateTimer(0);
  showMessage("Loading random word...");

  try {
    if (activeChallengeWord) {
      answer = activeChallengeWord;
    } else {
      answer = await getRandomDictionaryWord(currentWordLength);
    }
    isReady = true;
    if (activeChallengeWord) {
      showMessage(`1v1 challenge: guess the ${currentWordLength}-letter word`);
    } else {
      showMessage(`Guess the ${currentWordLength}-letter word`);
    }
    startTimer();
  } catch (_error) {
    gameOver = true;
    showMessage("Could not load a random word. Try New Game.");
  }
}

function resetBoard() {
  currentRow = 0;
  currentCol = 0;
  gameOver = false;
  isSubmitting = false;
  currentGameWon = false;
  localRematchRequested = false;
  remoteRematchRequested = false;
  localReadyToStart = false;
  remoteReadyToStart = false;
  isCountdownActive = false;
  localFinishedPayload = null;
  remoteFinishedPayload = null;
  revealHistory.length = 0;
  guesses = Array.from({ length: ROWS }, () => Array(currentWordLength).fill(""));

  keyRefs.forEach((keyEl, keyName) => {
    if (keyName === "enter" || keyName === "back") {
      keyEl.className = "key large";
    } else {
      keyEl.className = "key";
    }
    delete keyEl.dataset.state;
  });

  confettiLayerEl.innerHTML = "";
}

function shakeRow(rowIndex) {
  const rowEl = rowRefs[rowIndex];
  if (!rowEl) {
    return;
  }
  rowEl.classList.remove("shake");
  void rowEl.offsetWidth;
  rowEl.classList.add("shake");
}

function launchConfetti() {
  confettiLayerEl.innerHTML = "";
  const count = 42;

  for (let i = 0; i < count; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.backgroundColor = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.setProperty("--drift-x", `${Math.floor(Math.random() * 180 - 90)}px`);
    piece.style.setProperty("--spin", `${Math.floor(Math.random() * 1080 - 540)}deg`);
    piece.style.setProperty("--duration", `${1000 + Math.floor(Math.random() * 700)}ms`);
    confettiLayerEl.appendChild(piece);
  }

  setTimeout(() => {
    confettiLayerEl.innerHTML = "";
  }, 2200);
}

function openHelpModal() {
  helpModalEl.classList.remove("hidden");
}

function closeHelpModal() {
  helpModalEl.classList.add("hidden");
}

function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_STORAGE_KEY);
    if (!raw) {
      return { played: 0, won: 0, currentStreak: 0 };
    }
    const parsed = JSON.parse(raw);
    const played = Number(parsed.played) || 0;
    const won = Number(parsed.won) || 0;
    const currentStreak = Number(parsed.currentStreak) || 0;
    return { played, won, currentStreak };
  } catch (_error) {
    return { played: 0, won: 0, currentStreak: 0 };
  }
}

function saveStats() {
  localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(sessionStats));
}

function createDefaultRealtimeStats() {
  return {
    played: 0,
    won: 0,
    losses: 0,
    ties: 0,
  };
}

function resetRealtimeStats() {
  realtimeStats.played = 0;
  realtimeStats.won = 0;
  realtimeStats.losses = 0;
  realtimeStats.ties = 0;
  realtimeRoundScored = false;
  updateStatsDisplay();
}

function recordRealtimeRound(result) {
  if (realtimeRoundScored) {
    return;
  }
  realtimeRoundScored = true;
  realtimeStats.played += 1;
  if (result === "win") {
    realtimeStats.won += 1;
  } else if (result === "loss") {
    realtimeStats.losses += 1;
  } else {
    realtimeStats.ties += 1;
  }
  updateStatsDisplay();
}

function finalizeGameStats(didWin) {
  sessionStats.played += 1;
  if (didWin) {
    sessionStats.won += 1;
    sessionStats.currentStreak += 1;
  } else {
    sessionStats.currentStreak = 0;
  }
  saveStats();
  updateStatsDisplay();
}

async function shareResults() {
  if (!gameOver || revealHistory.length === 0) {
    showMessage("Finish the game to share results.");
    return;
  }

  const attempts = currentGameWon ? revealHistory.length : "X";
  const emojiRows = revealHistory
    .map((row) => row.map((state) => stateToEmoji(state)).join(""))
    .join("\n");
  const textToShare = `LETTERFORGE ${attempts}/${ROWS}\n\n${emojiRows}`;

  try {
    await navigator.clipboard.writeText(textToShare);
    showMessage("Results copied to clipboard.");
  } catch (_error) {
    showMessage("Unable to copy results.");
  }
}

function stateToEmoji(state) {
  if (state === "correct") {
    return "🟩";
  }
  if (state === "present") {
    return "🟨";
  }
  return "⬛";
}

function resolveCurrentWordLength() {
  const selected = levelSelectEl.value;
  if (selected === "random") {
    return randomIntInclusive(MIN_WORD_LENGTH, MAX_WORD_LENGTH);
  }

  const parsed = Number(selected);
  if (Number.isInteger(parsed) && parsed >= MIN_WORD_LENGTH && parsed <= MAX_WORD_LENGTH) {
    return parsed;
  }

  return DEFAULT_WORD_LENGTH;
}

async function handleLevelChange() {
  if (isRealtimeMode) {
    if (!isHostRole) {
      return;
    }
    sendRealtimeMessage({ type: "level_update", value: levelSelectEl.value });
    if (!opponentConnected) {
      updateRealtimeStatus("Level set. Share link and wait for opponent.");
      return;
    }
    if (!localReadyToStart && !remoteReadyToStart && !isCountdownActive) {
      updateRealtimeStatus("Level updated. Both players press Ready.");
    }
    return;
  }

  await startNewGame();
}

function randomIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function applySavedTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || "classic";
  const hasOption = Array.from(themeSelectEl.options).some((option) => option.value === savedTheme);
  const theme = hasOption ? savedTheme : "classic";
  themeSelectEl.value = theme;
  applyTheme(theme, false);
}

function applyTheme(theme, persist) {
  document.body.classList.remove("theme-midnight", "theme-forest", "theme-sunset");

  if (theme === "midnight") {
    document.body.classList.add("theme-midnight");
  } else if (theme === "forest") {
    document.body.classList.add("theme-forest");
  } else if (theme === "sunset") {
    document.body.classList.add("theme-sunset");
  }

  if (persist) {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function loadChallengeFromUrl() {
  const currentUrl = new URL(window.location.href);
  const realtime = currentUrl.searchParams.get("rt");
  const hostId = currentUrl.searchParams.get("host");
  const levelValue = currentUrl.searchParams.get("lvl");
  const token = currentUrl.searchParams.get(CHALLENGE_PARAM_KEY);

  isRealtimeMode = realtime === "1" && Boolean(hostId);
  hostPeerId = hostId || "";
  isHostRole = false;
  if (isRealtimeMode) {
    resetRealtimeStats();
  }

  if (!token) {
    activeChallengeWord = "";
    return;
  }

  const parsedWord = parseChallengeToken(token);
  activeChallengeWord = parsedWord || "";

  if (levelValue) {
    const hasOption = Array.from(levelSelectEl.options).some((option) => option.value === levelValue);
    if (hasOption) {
      levelSelectEl.value = levelValue;
    }
  }
}

function parseChallengeToken(token) {
  try {
    const normalized = token.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const decoded = atob(padded);
    const payload = JSON.parse(decoded);
    const word = String(payload.word || "").toLowerCase();

    if (!/^[a-z]+$/.test(word)) {
      return "";
    }
    if (word.length < MIN_WORD_LENGTH || word.length > MAX_WORD_LENGTH) {
      return "";
    }
    return word;
  } catch (_error) {
    return "";
  }
}

function createChallengeToken(word) {
  const payload = JSON.stringify({ word });
  return btoa(payload).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function handleVsButton() {
  if (isRealtimeMode) {
    resetRealtimeStats();
    exitChallengeMode();
    await startNewGame();
    showMessage("Exited 1v1 challenge mode.");
    return;
  }

  if (!isReady || !answer) {
    showMessage("Wait for the game to finish loading first.");
    return;
  }

  if (!myPeerId) {
    showMessage("Realtime is still initializing. Try again in a second.");
    return;
  }

  const challengeUrl = new URL(window.location.href);
  challengeUrl.searchParams.set("rt", "1");
  challengeUrl.searchParams.set("host", myPeerId);
  challengeUrl.searchParams.set("lvl", levelSelectEl.value);
  challengeUrl.searchParams.delete(CHALLENGE_PARAM_KEY);

  isRealtimeMode = true;
  isHostRole = true;
  hostPeerId = myPeerId;
  activeChallengeWord = "";
  resetRealtimeStats();
  window.history.replaceState({}, "", challengeUrl.toString());
  updateChallengeUi();
  prepareReadyLobby("Challenge active. Waiting for your friend to join...");

  try {
    await navigator.clipboard.writeText(challengeUrl.toString());
    showMessage("1v1 challenge link copied. Send it to your friend.");
  } catch (_error) {
    showMessage("Could not copy challenge link.");
  }
}

function exitChallengeMode() {
  activeChallengeWord = "";
  isRealtimeMode = false;
  isHostRole = false;
  hostPeerId = "";
  opponentConnected = false;
  localRematchRequested = false;
  remoteRematchRequested = false;
  localReadyToStart = false;
  remoteReadyToStart = false;
  isCountdownActive = false;
  localFinishedPayload = null;
  remoteFinishedPayload = null;
  const url = new URL(window.location.href);
  url.searchParams.delete("rt");
  url.searchParams.delete("host");
  url.searchParams.delete(CHALLENGE_PARAM_KEY);
  window.history.replaceState({}, "", url.toString());
  closeRealtimeConnection();
  updateChallengeUi();
  updateRealtimeStatus("");
  updateStatsDisplay();
}

function updateChallengeUi() {
  const levelLockedForRealtime = isRealtimeMode && (!isHostRole || localReadyToStart || remoteReadyToStart || isCountdownActive);
  levelSelectEl.disabled = isRealtimeMode ? levelLockedForRealtime : Boolean(activeChallengeWord);
  newGameBtn.textContent = isRealtimeMode ? "Rematch" : "New Game";
  readyBtn.classList.toggle("hidden", !isRealtimeMode);
  if (activeChallengeWord) {
    const lengthValue = String(activeChallengeWord.length);
    const hasExactOption = Array.from(levelSelectEl.options).some((option) => option.value === lengthValue);
    levelSelectEl.value = hasExactOption ? lengthValue : "random";
  }
  vsBtn.textContent = isRealtimeMode ? "Exit 1v1" : "1v1";
  updateReadyButtonUi();
}

function initRealtime() {
  if (!window.Peer) {
    updateRealtimeStatus("Realtime unavailable (PeerJS failed to load).");
    return;
  }

  peerInstance = new window.Peer();
  peerInstance.on("open", (id) => {
    myPeerId = id;
    if (isRealtimeMode && hostPeerId && hostPeerId !== myPeerId) {
      connectToHostPeer();
    }
  });
  peerInstance.on("connection", (conn) => {
    peerConnection = conn;
    isHostRole = true;
    hostPeerId = myPeerId;
    attachPeerHandlers(conn);
  });
}

function connectToHostPeer() {
  if (!peerInstance || !hostPeerId || hostPeerId === myPeerId) {
    return;
  }
  peerConnection = peerInstance.connect(hostPeerId, { reliable: true });
  attachPeerHandlers(peerConnection);
}

function attachPeerHandlers(conn) {
  conn.on("open", () => {
    opponentConnected = true;
    updateChallengeUi();
    if (isRealtimeMode) {
      prepareReadyLobby(isHostRole ? "Opponent connected. Choose level and press Ready." : "Connected. Waiting for host and your Ready.");
    }

    sendRealtimeMessage({
      type: "hello",
      wordLength: activeChallengeWord ? activeChallengeWord.length : currentWordLength,
    });
    if (isRealtimeMode && isHostRole) {
      sendRealtimeMessage({ type: "level_update", value: levelSelectEl.value });
    }
  });

  conn.on("data", (data) => {
    handleRealtimeMessage(data);
  });

  conn.on("close", () => {
    opponentConnected = false;
    localReadyToStart = false;
    remoteReadyToStart = false;
    isCountdownActive = false;
    updateChallengeUi();
    updateRealtimeStatus(isRealtimeMode ? "Opponent disconnected." : "");
  });
}

function sendRealtimeMessage(message) {
  if (peerConnection && peerConnection.open) {
    peerConnection.send(message);
  }
}

function handleRealtimeMessage(message) {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "level_update") {
    const value = String(message.value || "");
    const hasOption = Array.from(levelSelectEl.options).some((option) => option.value === value);
    if (hasOption && !isHostRole) {
      levelSelectEl.value = value;
    }
    return;
  }

  if (message.type === "ready") {
    remoteReadyToStart = true;
    updateReadyButtonUi();
    updateRealtimeStatus(localReadyToStart ? "Both ready. Starting soon..." : "Opponent readied. Press Ready.");
    if (isHostRole && localReadyToStart && !isCountdownActive) {
      void startRoundAfterBothReady();
    }
    return;
  }

  if (message.type === "round_start") {
    const word = String(message.word || "").toLowerCase();
    const startAt = Number(message.startAt) || Date.now();
    if (!/^[a-z]+$/.test(word)) {
      return;
    }
    isRealtimeMode = true;
    activeChallengeWord = word;
    localReadyToStart = false;
    remoteReadyToStart = false;
    isCountdownActive = true;
    updateChallengeUi();
    void beginSyncedRound(word, startAt);
    return;
  }

  if (message.type === "finish") {
    remoteFinishedPayload = message.payload || null;
    if (remoteFinishedPayload && remoteFinishedPayload.won && !gameOver) {
      // In realtime 1v1, opponent solving ends the round for both players.
      stopTimer();
      gameOver = true;
      isReady = false;
      currentGameWon = false;
      showMessage(`Opponent solved it first. Word was ${answer.toUpperCase()}.`);
      updateRealtimeStatus("Round ended. Opponent won.");
    }
    if (isHostRole) {
      const result = resolveRealtimeWinner(localFinishedPayload, remoteFinishedPayload);
      if (result) {
        sendRealtimeMessage({ type: "match_result", result });
        applyRealtimeMatchResult(result);
      }
    }
    return;
  }

  if (message.type === "match_result") {
    applyRealtimeMatchResult(message.result);
    return;
  }

  if (message.type === "rematch_request") {
    remoteRematchRequested = true;
    updateRealtimeStatus("Opponent requested a rematch.");
    if (localRematchRequested && isHostRole) {
      sendRealtimeMessage({ type: "rematch_ready" });
      prepareReadyLobby("Rematch accepted. Both players press Ready.");
    }
    return;
  }

  if (message.type === "rematch_ready") {
    prepareReadyLobby("Rematch accepted. Both players press Ready.");
  }
}

async function beginSyncedRound(word, startAt) {
  activeChallengeWord = word;
  currentWordLength = word.length;
  localReadyToStart = false;
  remoteReadyToStart = false;
  buildGrid();
  resetBoard();
  answer = word;
  isReady = false;
  gameOver = false;
  realtimeRoundScored = false;
  updateChallengeUi();

  const waitMs = Math.max(0, startAt - Date.now());
  const seconds = Math.max(1, Math.ceil(waitMs / 1000));
  showMessage(`Round starts in ${seconds}s...`);
  setTimeout(() => {
    isReady = true;
    isCountdownActive = false;
    startTimer(startAt);
    updateChallengeUi();
    showMessage(`1v1 challenge: guess the ${currentWordLength}-letter word`);
  }, waitMs);
}

function publishFinish(won, attempts) {
  if (!isRealtimeMode || !opponentConnected) {
    return;
  }

  localFinishedPayload = {
    won,
    attempts,
    elapsedMs: Math.max(0, Date.now() - gameStartMs),
  };
  sendRealtimeMessage({ type: "finish", payload: localFinishedPayload });

  if (isHostRole) {
    const result = resolveRealtimeWinner(localFinishedPayload, remoteFinishedPayload);
    if (result) {
      sendRealtimeMessage({ type: "match_result", result });
      applyRealtimeMatchResult(result);
    }
  }
}

function resolveRealtimeWinner(localPayload, remotePayload) {
  if (!localPayload && !remotePayload) {
    return null;
  }
  if (localPayload && localPayload.won && !remotePayload) {
    return "host";
  }
  if (remotePayload && remotePayload.won && !localPayload) {
    return "guest";
  }
  if (!localPayload || !remotePayload) {
    return null;
  }

  if (localPayload.won && !remotePayload.won) {
    return "host";
  }
  if (!localPayload.won && remotePayload.won) {
    return "guest";
  }
  if (!localPayload.won && !remotePayload.won) {
    return "tie";
  }

  if (localPayload.elapsedMs < remotePayload.elapsedMs) {
    return "host";
  }
  if (remotePayload.elapsedMs < localPayload.elapsedMs) {
    return "guest";
  }
  if (localPayload.attempts < remotePayload.attempts) {
    return "host";
  }
  if (remotePayload.attempts < localPayload.attempts) {
    return "guest";
  }
  return "tie";
}

function applyRealtimeMatchResult(result) {
  if (!isRealtimeMode) {
    return;
  }
  const iWon = (result === "host" && isHostRole) || (result === "guest" && !isHostRole);
  const opponentWon = (result === "host" && !isHostRole) || (result === "guest" && isHostRole);
  if (iWon) {
    recordRealtimeRound("win");
    updateRealtimeStatus("You won the 1v1 round.");
  } else if (opponentWon) {
    recordRealtimeRound("loss");
    updateRealtimeStatus("Opponent won the 1v1 round.");
  } else {
    recordRealtimeRound("tie");
    updateRealtimeStatus("Round ended in a tie.");
  }
}

function requestRematch() {
  if (!isRealtimeMode || !opponentConnected) {
    showMessage("No connected opponent. Share your 1v1 link first.");
    return;
  }
  if (!gameOver) {
    showMessage("Finish the current round first.");
    return;
  }
  localRematchRequested = true;
  sendRealtimeMessage({ type: "rematch_request" });
  if (remoteRematchRequested) {
    if (isHostRole) {
      sendRealtimeMessage({ type: "rematch_ready" });
    }
    prepareReadyLobby("Rematch accepted. Both players press Ready.");
  } else {
    updateRealtimeStatus("Rematch requested. Waiting for opponent...");
  }
}

function prepareReadyLobby(statusText) {
  activeChallengeWord = "";
  localReadyToStart = false;
  remoteReadyToStart = false;
  isCountdownActive = false;
  localRematchRequested = false;
  remoteRematchRequested = false;
  localFinishedPayload = null;
  remoteFinishedPayload = null;
  realtimeRoundScored = false;
  stopTimer();
  updateTimer(0);
  isReady = false;
  gameOver = false;
  resetBoard();
  updateChallengeUi();
  updateRealtimeStatus(statusText);
  showMessage("Press Ready when both players are set.");
}

async function handleReadyClick() {
  if (!isRealtimeMode) {
    return;
  }
  if (!opponentConnected) {
    updateRealtimeStatus("Waiting for opponent to connect...");
    return;
  }
  if (localReadyToStart || isCountdownActive) {
    return;
  }

  localReadyToStart = true;
  updateReadyButtonUi();
  sendRealtimeMessage({ type: "ready" });

  if (remoteReadyToStart) {
    updateRealtimeStatus("Both ready. Starting in 3...");
    if (isHostRole) {
      await startRoundAfterBothReady();
    }
  } else {
    updateRealtimeStatus("Readied. Waiting for opponent...");
  }
}

async function startRoundAfterBothReady() {
  if (!isRealtimeMode || !isHostRole || !localReadyToStart || !remoteReadyToStart) {
    return;
  }
  if (isCountdownActive) {
    return;
  }

  isCountdownActive = true;
  updateChallengeUi();
  updateRealtimeStatus("Both ready. Starting in 3...");

  const selectedLength = resolveCurrentWordLength();
  let startWord = "";
  try {
    startWord = await getRandomDictionaryWord(selectedLength);
  } catch (_error) {
    isCountdownActive = false;
    updateChallengeUi();
    updateRealtimeStatus("Could not start round. Try Ready again.");
    return;
  }

  activeChallengeWord = startWord;
  currentWordLength = startWord.length;
  localRematchRequested = false;
  remoteRematchRequested = false;

  const token = createChallengeToken(startWord);
  const url = new URL(window.location.href);
  url.searchParams.set("rt", "1");
  url.searchParams.set("host", myPeerId);
  url.searchParams.set("lvl", levelSelectEl.value);
  url.searchParams.set(CHALLENGE_PARAM_KEY, token);
  window.history.replaceState({}, "", url.toString());

  const startAt = Date.now() + 3000;
  sendRealtimeMessage({ type: "round_start", word: startWord, startAt });
  await beginSyncedRound(startWord, startAt);
  updateRealtimeStatus("Round live.");
}

function updateReadyButtonUi() {
  if (!isRealtimeMode) {
    return;
  }

  readyBtn.classList.remove("waiting");
  readyBtn.disabled = false;

  if (isCountdownActive) {
    readyBtn.textContent = "Starting...";
    readyBtn.disabled = true;
    readyBtn.classList.add("waiting");
    return;
  }

  if (isReady && !gameOver) {
    readyBtn.textContent = "In Match";
    readyBtn.disabled = true;
    readyBtn.classList.add("waiting");
    return;
  }

  if (localReadyToStart && !remoteReadyToStart) {
    readyBtn.textContent = "Readied";
    readyBtn.disabled = true;
    readyBtn.classList.add("waiting");
    return;
  }

  if (!localReadyToStart && remoteReadyToStart) {
    readyBtn.textContent = "Ready";
    return;
  }

  if (localReadyToStart && remoteReadyToStart) {
    readyBtn.textContent = "Starting...";
    readyBtn.disabled = true;
    readyBtn.classList.add("waiting");
    return;
  }

  readyBtn.textContent = "Ready";
}

function closeRealtimeConnection() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
}

function updateRealtimeStatus(text) {
  realtimeStatusEl.textContent = text || "";
}

function startTimer(startAt = Date.now()) {
  stopTimer();
  gameStartMs = startAt;
  const tick = () => {
    updateTimer(Math.max(0, Date.now() - gameStartMs));
  };
  tick();
  timerIntervalId = setInterval(tick, 100);
}

function stopTimer() {
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

function updateTimer(elapsedMs) {
  const totalTenths = Math.floor(elapsedMs / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  timerEl.textContent = `Time: ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
}
