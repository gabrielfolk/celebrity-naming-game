const ROUNDS = 10;
const ADVANCE_DELAY_MS = 2000; // time to read the result before the next photo
const POINTS = 3;
const DEEP_BONUS = 2; // for answering with a lesser-known name, e.g. Jimmy Donaldson for MrBeast
const MAX_LOAD_FAILURES = 3; // in a row, before assuming the connection is down
const API = "api/leaderboard.php";
const ONLINE = location.protocol !== "file:"; // the leaderboard only works on the real site

const $ = (id) => document.getElementById(id);

const EVERYONE = {
  key: "everyone",
  label: "Everyone",
  emoji: "🌟",
  people: Object.values(CATEGORIES).flatMap((c) => c.people),
  hard: Object.values(CATEGORIES).flatMap((c) => c.hard),
};
for (const [key, cat] of Object.entries(CATEGORIES)) cat.key = key;
const ALL_PEOPLE = [...EVERYONE.people, ...EVERYONE.hard];
const MODES = { easy: "Human", hard: "Perfect Human Specimen" };

let mode = "easy";
let category = EVERYONE;
let dailyDate = null; // the UTC date while playing the daily challenge, otherwise null
let totalRounds = ROUNDS;
let deck = [];
let round = 0;
let score = 0;
let streak = 0;
let current = null; // { name, answers, image }
let roundOver = false;
let history = [];
let gameId = 0; // bumped on start/leave so a photo still loading for an old game is ignored

// ---------- Answer matching ----------

function normalize(s) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

// Accepted: full name, any alias, or the last name alone. Small typos allowed.
// "Drake (musician)" -> "Drake"
function displayName(title) {
  return title.replace(/_/g, " ").replace(/\s*\(.*\)$/, "");
}

function lastName(name) {
  const parts = normalize(name).split(" ").filter((p) => p !== "jr");
  // Skip one- or two-letter endings like "Lil Nas X" -> "x".
  return parts.length > 1 && parts[parts.length - 1].length >= 3 ? parts[parts.length - 1] : null;
}

// Last names shared by two or more celebrities in the same mode (e.g. Jackson)
// aren't accepted alone. Each mode only ever shows its own list, so Will Smith
// keeps "Smith" in Easy even though Maggie Smith is in Hard.
function sharedLastNames(people) {
  const counts = {};
  for (const p of people) {
    const ln = lastName(displayName(p.wiki));
    if (ln) counts[ln] = (counts[ln] || 0) + 1;
  }
  return new Set(Object.keys(counts).filter((ln) => counts[ln] > 1));
}
const SHARED_LAST_NAMES = { easy: sharedLastNames(EVERYONE.people), hard: sharedLastNames(EVERYONE.hard) };

function buildAnswers(name, aliases = [], shared = SHARED_LAST_NAMES[mode]) {
  const answers = new Set([name, ...aliases].map(normalize));
  const ln = lastName(name);
  if (ln && !shared.has(ln)) answers.add(ln);
  return [...answers];
}

// Every name any celebrity goes by, including shared last names. A guess that is
// exactly someone else's name isn't let through as a typo (Carey vs Carrey).
const ALL_NAMES = new Set(
  ALL_PEOPLE.flatMap((p) => {
    const name = displayName(p.wiki);
    return [...buildAnswers(name, p.aliases), lastName(name), ...(p.deep || []).map(normalize)].filter(Boolean);
  })
);

// "deep" for a lesser-known name, "normal" for any other accepted answer, or null.
function matchGuess(guess, celeb) {
  if (celeb.deepAnswers.includes(normalize(guess))) return "deep";
  if (isCorrect(guess, celeb.answers)) return "normal";
  if (isCorrect(guess, celeb.deepAnswers)) return "deep";
  return null;
}

function isCorrect(guess, answers) {
  const g = normalize(guess);
  if (!g) return false;
  if (answers.includes(g)) return true;
  if (ALL_NAMES.has(g)) return false;
  return answers.some((a) => {
    const tolerance = a.length <= 4 ? 0 : a.length <= 8 ? 1 : 2;
    return levenshtein(g, a) <= tolerance;
  });
}

// ---------- Fetching photos ----------

async function fetchCelebrity(entry) {
  const res = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(entry.wiki)}`
  );
  // "permanent" failures won't fix themselves on retry, unlike a dropped connection.
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { permanent: res.status === 404 });
  const data = await res.json();
  if (!data.thumbnail?.source) throw Object.assign(new Error("No photo"), { permanent: true });
  const name = displayName(data.title);
  return {
    name,
    answers: buildAnswers(name, entry.aliases),
    deepNames: entry.deep || [],
    deepAnswers: (entry.deep || []).map(normalize),
    image: data.thumbnail.source,
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = reject;
    img.src = src;
  });
}

// ---------- Game flow ----------

function shuffle(arr, random = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Same seed, same sequence (mulberry32), so everyone gets the same daily deck.
function seededRandom(seed) {
  let a = 2166136261;
  for (let i = 0; i < seed.length; i++) a = Math.imul(a ^ seed.charCodeAt(i), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The daily challenge changes at midnight UTC, the same moment for everyone.
function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

// Browser storage can be unavailable (private windows, blocked cookies); the game
// still works without it, it just won't remember anything.
function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const dailyKey = (date, m) => `celeb:daily:${date}:${m}`;

function show(screen) {
  for (const id of ["start-screen", "game-screen", "end-screen", "leaderboard-screen"]) {
    $(id).hidden = id !== screen;
  }
  $("home-btn").hidden = screen === "start-screen";
  document.querySelector(".stats").hidden = screen === "leaderboard-screen";
}

function updateStats() {
  $("round").textContent = round;
  $("total").textContent = totalRounds;
  $("score").textContent = score;
  $("streak").textContent = streak;
}

// The celebrities a category plays with in the current mode.
function pool(cat) {
  return mode === "hard" ? cat.hard : cat.people;
}

function setPressed(group, attr, value) {
  for (const btn of document.querySelectorAll(`#${group} button`)) {
    btn.setAttribute("aria-pressed", btn.dataset[attr] === value);
  }
}

function setMode(m) {
  mode = m;
  setPressed("mode-picker", "mode", mode);
  renderDaily();
  renderCategories();
}

// One try per day per mode. It counts as used once started, so leaving and
// restarting can't be used to see the answers first.
function renderDaily() {
  const played = load(dailyKey(todayUTC(), mode));
  $("daily-status").textContent = !played
    ? "Same 10 celebrities for everyone today"
    : played.score == null
      ? "Started today, not finished"
      : `Done today: ${played.score} points`;
}

function handleDaily() {
  if (load(dailyKey(todayUTC(), mode))) {
    if (ONLINE) openLeaderboard({ kind: "daily", mode });
    else alert("You've already played today's challenge. Come back tomorrow!");
    return;
  }
  startGame(EVERYONE, todayUTC());
}

function renderCategories() {
  const list = $("category-list");
  list.innerHTML = "";
  for (const cat of [EVERYONE, ...Object.values(CATEGORIES)]) {
    const btn = document.createElement("button");
    if (cat === EVERYONE) btn.className = "everyone";
    btn.innerHTML = `<span class="emoji">${cat.emoji}</span><span>${cat.label}</span><span class="count">${pool(cat).length} celebrities</span>`;
    btn.addEventListener("click", () => startGame(cat));
    list.appendChild(btn);
  }
}

function goHome() {
  const inGame = !$("game-screen").hidden;
  if (inGame && dailyDate && !confirm("Leave the daily challenge? You won't be able to play it again today.")) return;
  if (inGame && !dailyDate && history.length > 0 && !confirm("Leave this game? Your score will be lost.")) return;
  showCategoryPicker();
}

function showCategoryPicker() {
  gameId++;
  $("category-label").hidden = true;
  round = score = streak = 0;
  totalRounds = ROUNDS;
  updateStats();
  renderDaily();
  show("start-screen");
}

function startGame(cat = category, date = null) {
  gameId++;
  category = cat;
  dailyDate = date;
  totalRounds = Math.min(ROUNDS, pool(cat).length);
  $("category-label").textContent = date
    ? `📅 Daily challenge · ${MODES[mode]}`
    : `${cat.emoji} ${cat.label} · ${MODES[mode]}`;
  $("category-label").hidden = false;
  if (date) save(dailyKey(date, mode), { score: null });
  deck = date ? shuffle(pool(cat), seededRandom(`${date}:${mode}`)) : shuffle(pool(cat));
  round = 0;
  score = 0;
  streak = 0;
  history = [];
  show("game-screen");
  nextRound();
}

async function nextRound() {
  if (round >= totalRounds) return endGame();

  roundOver = false;
  current = null;

  $("retry-btn").hidden = true;
  $("photo").hidden = true;
  $("loading").hidden = false;
  $("loading").textContent = "Loading…";
  $("feedback").textContent = "";
  $("feedback").className = "feedback";
  $("guess-input").value = "";
  setInputsEnabled(false);

  const thisGame = gameId;

  // Skip a celebrity whose photo fails to load, but stop after a few failures in
  // a row so a dropped connection doesn't burn through the whole deck.
  const failed = [];
  while (deck.length && failed.length < MAX_LOAD_FAILURES) {
    const entry = deck.pop();
    try {
      const celeb = await fetchCelebrity(entry);
      await loadImage(celeb.image);
      if (thisGame !== gameId) return; // player left or restarted while loading
      current = celeb;
      break;
    } catch (err) {
      if (thisGame !== gameId) return;
      if (!err.permanent) failed.push(entry);
    }
  }

  if (!current) {
    if (!failed.length) return endGame(); // ran out of celebrities
    deck.unshift(...failed); // retry them last, after the untried ones
    $("loading").textContent = "Couldn't load photos. Check your connection.";
    $("retry-btn").hidden = false;
    $("retry-btn").focus();
    return;
  }

  round++;
  updateStats();
  $("photo").src = current.image;
  $("photo").hidden = false;
  $("loading").hidden = true;
  setInputsEnabled(true);
  $("guess-input").focus();
}

function setInputsEnabled(enabled) {
  for (const id of ["guess-input", "skip-btn"]) $(id).disabled = !enabled;
  document.querySelector("#guess-form button").disabled = !enabled;
}

function finishRound(correct, points = 0, deep = false) {
  roundOver = true;
  score += points;
  streak = correct ? streak + 1 : 0;
  history.push({ name: current.name, correct, points, deep });
  updateStats();
  setInputsEnabled(false);

  // Leave the result up long enough to read, then move on on its own.
  const thisGame = gameId;
  setTimeout(() => {
    if (thisGame === gameId) nextRound();
  }, ADVANCE_DELAY_MS);
}

// Shows the lesser-known name too, so players learn it's worth more next time.
function fullName(celeb) {
  return celeb.deepNames.length ? `${celeb.name} (aka ${celeb.deepNames[0]})` : celeb.name;
}

function handleGuess(e) {
  e.preventDefault();
  if (roundOver || !current) return;
  const guess = $("guess-input").value;
  if (!guess.trim()) return;

  const fb = $("feedback");
  const match = matchGuess(guess, current);
  if (match) {
    const deep = match === "deep";
    const points = POINTS + (deep ? DEEP_BONUS : 0) + (streak >= 2 ? 1 : 0);
    fb.textContent = deep
      ? `🧠 Deep cut! It's ${fullName(current)}. +${points}`
      : `✅ Yes! It's ${fullName(current)}. +${points}`;
    fb.className = "feedback good";
    finishRound(true, points, deep);
  } else {
    $("guess-form").classList.remove("shake");
    void $("guess-form").offsetWidth; // restart animation
    $("guess-form").classList.add("shake");
    fb.textContent = `❌ Nope, it was ${fullName(current)}.`;
    fb.className = "feedback bad";
    finishRound(false);
  }
}

function handleSkip() {
  if (roundOver || !current) return;
  $("feedback").textContent = `Skipped. It was ${fullName(current)}.`;
  $("feedback").className = "feedback bad";
  finishRound(false);
}

function endGame() {
  show("end-screen");
  const correct = history.filter((h) => h.correct).length;
  $("final-score").textContent = `You got ${correct}/${history.length} right for ${score} points.`;
  $("summary").innerHTML = "";
  for (const h of history) {
    const li = document.createElement("li");
    li.textContent = `${h.deep ? "🧠" : h.correct ? "✅" : "❌"} ${h.name}${h.points ? ` (+${h.points})` : ""}`;
    $("summary").appendChild(li);
  }
  if (dailyDate) save(dailyKey(dailyDate, mode), { score });
  $("restart-btn").hidden = !!dailyDate;

  // Only full games go on the leaderboard.
  const canSubmit = ONLINE && history.length === ROUNDS;
  $("submit-form").hidden = !canSubmit;
  $("submit-form").querySelector("button").disabled = false;
  $("nickname-input").value = load("celeb:nickname") || "";
  $("submit-status").textContent = ONLINE ? "" : "Scores can be saved on the website version of the game.";
  $("end-board").hidden = true;
}

// ---------- Leaderboard ----------

// A random ID that marks this browser's scores, kept so you can find yourself on the board.
function playerId() {
  let id = load("celeb:player");
  if (!/^[0-9a-f]{32}$/.test(id || "")) {
    id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
    save("celeb:player", id);
  }
  return id;
}

async function api(method, params) {
  const res =
    method === "GET"
      ? await fetch(`${API}?${new URLSearchParams(params)}`)
      : await fetch(API, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(params) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.error || "The leaderboard is unavailable right now."), { status: res.status });
  }
  return data;
}

function boardLabel(b) {
  const cat = b.category === "everyone" ? EVERYONE : CATEGORIES[b.category];
  return b.kind === "daily" ? `📅 Daily challenge · ${MODES[b.mode]}` : `${cat.emoji} ${cat.label} · ${MODES[b.mode]}`;
}

function boardParams(b) {
  return b.kind === "daily"
    ? { kind: "daily", mode: b.mode, date: b.date || todayUTC() }
    : { kind: "random", mode: b.mode, category: b.category };
}

// Nicknames come from other players, so they only ever go in as text.
function renderBoard(list, data) {
  list.innerHTML = "";
  const rows = [...data.top];
  if (data.me && !data.top.some((r) => r.you)) rows.push(null, data.me);
  if (!rows.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No scores yet. Be the first!";
    list.appendChild(li);
  }
  for (const r of rows) {
    const li = document.createElement("li");
    if (!r) {
      li.className = "gap";
      li.textContent = "⋯";
    } else {
      if (r.you) li.className = "you";
      for (const [cls, text] of [["rank", `#${r.rank}`], ["name", r.nickname], ["points", r.score]]) {
        const span = document.createElement("span");
        span.className = cls;
        span.textContent = text;
        li.appendChild(span);
      }
    }
    list.appendChild(li);
  }
  list.hidden = false;
}

async function handleSubmitScore(e) {
  e.preventDefault();
  const nickname = $("nickname-input").value.trim();
  if (!nickname) return $("nickname-input").focus();
  save("celeb:nickname", nickname);

  const b = dailyDate ? { kind: "daily", mode, date: dailyDate } : { kind: "random", mode, category: category.key };
  const button = $("submit-form").querySelector("button");
  button.disabled = true;
  $("submit-status").textContent = "Saving…";
  try {
    const data = await api("POST", {
      ...boardParams(b),
      player: playerId(),
      nickname,
      rounds: history.map((h) => ({ correct: h.correct, deep: h.deep })),
    });
    $("submit-form").hidden = true;
    const rank = data.me.rank;
    $("submit-status").textContent =
      b.kind === "daily"
        ? `You're #${rank} on today's challenge!`
        : data.newBest
          ? `New best! You're #${rank} in ${boardLabel(b)}.`
          : `Your best here is still ${data.me.score} (#${rank}).`;
    renderBoard($("end-board"), data);
  } catch (err) {
    $("submit-status").textContent = err.message;
    if (err.status === 409) {
      $("submit-form").hidden = true;
      api("GET", { ...boardParams(b), player: playerId() })
        .then((data) => renderBoard($("end-board"), data))
        .catch(() => {});
    } else {
      button.disabled = false;
    }
  }
}

let lbView = { kind: "daily", mode: "easy", category: "everyone" };

function openLeaderboard(view = {}) {
  gameId++;
  $("category-label").hidden = true;
  lbView = { ...lbView, mode, ...view };
  show("leaderboard-screen");
  loadLeaderboard();
}

async function loadLeaderboard() {
  setPressed("lb-kind", "kind", lbView.kind);
  setPressed("lb-mode", "mode", lbView.mode);
  $("lb-category").hidden = lbView.kind !== "random";
  $("lb-category").value = lbView.category;
  $("lb-note").textContent =
    lbView.kind === "daily" ? "Today's challenge. A new one starts at midnight UTC." : "Each player's best game.";
  $("lb-list").hidden = true;
  $("lb-status").textContent = "Loading…";

  const view = { ...lbView };
  try {
    const data = await api("GET", { ...boardParams(view), player: playerId() });
    if (JSON.stringify(view) !== JSON.stringify(lbView)) return; // the player switched boards meanwhile
    $("lb-status").textContent = "";
    renderBoard($("lb-list"), data);
  } catch (err) {
    if (JSON.stringify(view) === JSON.stringify(lbView)) $("lb-status").textContent = err.message;
  }
}

function renderLeaderboardControls() {
  const select = $("lb-category");
  for (const cat of [EVERYONE, ...Object.values(CATEGORIES)]) {
    const opt = document.createElement("option");
    opt.value = cat.key;
    opt.textContent = `${cat.emoji} ${cat.label}`;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => {
    lbView.category = select.value;
    loadLeaderboard();
  });
  for (const btn of document.querySelectorAll("#lb-kind button")) {
    btn.addEventListener("click", () => {
      lbView.kind = btn.dataset.kind;
      loadLeaderboard();
    });
  }
  for (const btn of document.querySelectorAll("#lb-mode button")) {
    btn.addEventListener("click", () => {
      lbView.mode = btn.dataset.mode;
      loadLeaderboard();
    });
  }
  $("leaderboard-btn").hidden = !ONLINE;
}

$("restart-btn").addEventListener("click", () => startGame());
$("change-category-btn").addEventListener("click", showCategoryPicker);
$("home-btn").addEventListener("click", goHome);
$("guess-form").addEventListener("submit", handleGuess);
$("skip-btn").addEventListener("click", handleSkip);
$("retry-btn").addEventListener("click", nextRound);
$("daily-btn").addEventListener("click", handleDaily);
$("leaderboard-btn").addEventListener("click", () => openLeaderboard());
$("submit-form").addEventListener("submit", handleSubmitScore);
renderLeaderboardControls();
for (const btn of document.querySelectorAll("#mode-picker button")) {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
}
setMode(mode);
