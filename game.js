const ROUNDS = 10;
const MAX_WRONG_GUESSES = 3;
const MAX_LOAD_FAILURES = 3; // in a row, before assuming the connection is down

const $ = (id) => document.getElementById(id);

const EVERYONE = { label: "Everyone", emoji: "🌟", people: Object.values(CATEGORIES).flatMap((c) => c.people) };

let category = EVERYONE;
let totalRounds = ROUNDS;
let deck = [];
let round = 0;
let score = 0;
let streak = 0;
let current = null; // { name, answers, image }
let wrongGuesses = 0;
let hintLevel = 0;
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

// Last names shared by two or more celebrities (e.g. Jackson) aren't accepted alone.
const SHARED_LAST_NAMES = (() => {
  const counts = {};
  for (const cat of Object.values(CATEGORIES)) {
    for (const p of cat.people) {
      const ln = lastName(displayName(p.wiki));
      if (ln) counts[ln] = (counts[ln] || 0) + 1;
    }
  }
  return new Set(Object.keys(counts).filter((ln) => counts[ln] > 1));
})();

function buildAnswers(name, aliases = []) {
  const answers = new Set([name, ...aliases].map(normalize));
  const ln = lastName(name);
  if (ln && !SHARED_LAST_NAMES.has(ln)) answers.add(ln);
  return [...answers];
}

// Every name any celebrity goes by, including shared last names. A guess that is
// exactly someone else's name isn't let through as a typo (Carey vs Carrey).
const ALL_NAMES = new Set(
  Object.values(CATEGORIES).flatMap((cat) =>
    cat.people.flatMap((p) => {
      const name = displayName(p.wiki);
      return [...buildAnswers(name, p.aliases), lastName(name)].filter(Boolean);
    })
  )
);

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

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function show(screen) {
  for (const id of ["start-screen", "game-screen", "end-screen"]) {
    $(id).hidden = id !== screen;
  }
  $("home-btn").hidden = screen === "start-screen";
}

function updateStats() {
  $("round").textContent = round;
  $("total").textContent = totalRounds;
  $("score").textContent = score;
  $("streak").textContent = streak;
}

function renderCategories() {
  const list = $("category-list");
  list.innerHTML = "";
  for (const cat of [EVERYONE, ...Object.values(CATEGORIES)]) {
    const btn = document.createElement("button");
    if (cat === EVERYONE) btn.className = "everyone primary";
    btn.innerHTML = `<span class="emoji">${cat.emoji}</span><span>${cat.label}</span><span class="count">${cat.people.length} celebrities</span>`;
    btn.addEventListener("click", () => startGame(cat));
    list.appendChild(btn);
  }
}

function goHome() {
  const midGame = !$("game-screen").hidden && history.length > 0;
  if (midGame && !confirm("Leave this game? Your score will be lost.")) return;
  showCategoryPicker();
}

function showCategoryPicker() {
  gameId++;
  $("category-label").hidden = true;
  round = score = streak = 0;
  totalRounds = ROUNDS;
  updateStats();
  show("start-screen");
}

function startGame(cat = category) {
  gameId++;
  category = cat;
  totalRounds = Math.min(ROUNDS, cat.people.length);
  $("category-label").textContent = `${cat.emoji} ${cat.label}`;
  $("category-label").hidden = false;
  deck = shuffle(cat.people);
  round = 0;
  score = 0;
  streak = 0;
  history = [];
  show("game-screen");
  nextRound();
}

async function nextRound() {
  if (round >= totalRounds) return endGame();

  wrongGuesses = 0;
  hintLevel = 0;
  roundOver = false;
  current = null;

  $("retry-btn").hidden = true;
  $("photo").hidden = true;
  $("loading").hidden = false;
  $("loading").textContent = "Loading…";
  $("hint").textContent = "";
  $("feedback").textContent = "";
  $("feedback").className = "feedback";
  $("guess-input").value = "";
  $("next-btn").hidden = true;
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
  for (const id of ["guess-input", "hint-btn", "skip-btn"]) $(id).disabled = !enabled;
  document.querySelector("#guess-form button").disabled = !enabled;
}

function finishRound(correct, points = 0) {
  roundOver = true;
  score += points;
  streak = correct ? streak + 1 : 0;
  history.push({ name: current.name, correct, points });
  updateStats();
  setInputsEnabled(false);
  $("next-btn").hidden = false;
  $("next-btn").textContent = round >= totalRounds ?"See results →" : "Next →";
  $("next-btn").focus();
}

function handleGuess(e) {
  e.preventDefault();
  if (roundOver || !current) return;
  const guess = $("guess-input").value;
  if (!guess.trim()) return;

  const fb = $("feedback");
  if (isCorrect(guess, current.answers)) {
    const points = Math.max(1, 3 - hintLevel) + (streak >= 2 ? 1 : 0);
    fb.textContent = `✅ Yes! It's ${current.name}. +${points}`;
    fb.className = "feedback good";
    finishRound(true, points);
  } else {
    wrongGuesses++;
    const left = MAX_WRONG_GUESSES - wrongGuesses;
    $("guess-form").classList.remove("shake");
    void $("guess-form").offsetWidth; // restart animation
    $("guess-form").classList.add("shake");
    if (left > 0) {
      fb.textContent = `❌ Nope. ${left} ${left === 1 ? "try" : "tries"} left.`;
      fb.className = "feedback bad";
      $("guess-input").select();
    } else {
      fb.textContent = `It was ${current.name}.`;
      fb.className = "feedback bad";
      finishRound(false);
    }
  }
}

function handleHint() {
  if (roundOver || !current || hintLevel >= 2) return;
  hintLevel++;
  const words = current.name.split(" ");
  $("hint").textContent =
    hintLevel === 1
      ? words.map((w) => w[0] + "_".repeat(w.length - 1)).join("  ")
      : words.map((w) => w.slice(0, Math.ceil(w.length / 2)) + "_".repeat(Math.floor(w.length / 2))).join("  ");
  if (hintLevel >= 2) $("hint-btn").disabled = true;
}

function handleSkip() {
  if (roundOver || !current) return;
  $("feedback").textContent = `Skipped. It was ${current.name}.`;
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
    li.textContent = `${h.correct ? "✅" : "❌"} ${h.name}${h.points ? ` (+${h.points})` : ""}`;
    $("summary").appendChild(li);
  }
}

$("restart-btn").addEventListener("click", () => startGame());
$("change-category-btn").addEventListener("click", showCategoryPicker);
$("home-btn").addEventListener("click", goHome);
$("guess-form").addEventListener("submit", handleGuess);
$("hint-btn").addEventListener("click", handleHint);
$("skip-btn").addEventListener("click", handleSkip);
$("next-btn").addEventListener("click", nextRound);
$("retry-btn").addEventListener("click", nextRound);
renderCategories();
