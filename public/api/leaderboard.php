<?php
// Leaderboard API.
//   GET  ?kind=daily&mode=easy[&date=YYYY-MM-DD][&player=…]
//   GET  ?kind=random&mode=easy&category=movies[&player=…]
//   POST {kind, mode, category?, date?, player, nickname, rounds: [{correct, deep}, …]}
// The server works out the score from the rounds itself, using the same rules as
// game.js, so a submitted total is never trusted.

declare(strict_types=1);

const MODES = ['easy', 'hard'];
const CATEGORIES = ['everyone', 'movies', 'music', 'sports', 'public'];
const ROUNDS = 10;
const POINTS = 3;
const DEEP_BONUS = 2;
const TOP_N = 20;
const MAX_SUBMISSIONS_PER_HOUR = 30;

header_remove('X-Powered-By');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body);
    exit;
}

function fail(int $status, string $error): void
{
    respond($status, ['error' => $error]);
}

// The config lives outside the web folder: $CELEB_CONFIG if set, otherwise
// ~/celebrity-game-config.php.
function loadConfig(): array
{
    $path = getenv('CELEB_CONFIG');
    if (!$path) {
        $home = getenv('HOME');
        if (!$home && function_exists('posix_getpwuid')) {
            $home = posix_getpwuid(posix_geteuid())['dir'] ?? '';
        }
        $path = rtrim((string) $home, '/') . '/celebrity-game-config.php';
    }
    if (!is_readable($path)) {
        error_log("Leaderboard config not found at $path");
        fail(500, 'The leaderboard is not set up yet.');
    }
    return require $path;
}

function connect(array $config): PDO
{
    return new PDO($config['dsn'], $config['user'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}

// ---------- Input ----------

// Which board a request is about: kind, mode, category, period.
function board(array $in): array
{
    $kind = $in['kind'] ?? '';
    $mode = $in['mode'] ?? '';
    if (!in_array($mode, MODES, true)) {
        fail(400, 'Unknown mode.');
    }
    if ($kind === 'daily') {
        $date = $in['date'] ?? gmdate('Y-m-d');
        if (!is_string($date) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            fail(400, 'Bad date.');
        }
        return ['kind' => 'daily', 'mode' => $mode, 'category' => 'everyone', 'period' => $date];
    }
    if ($kind === 'random') {
        $category = $in['category'] ?? '';
        if (!in_array($category, CATEGORIES, true)) {
            fail(400, 'Unknown category.');
        }
        return ['kind' => 'random', 'mode' => $mode, 'category' => $category, 'period' => 'all'];
    }
    fail(400, 'Unknown leaderboard.');
}

function player($raw): ?string
{
    return is_string($raw) && preg_match('/^[0-9a-f]{32}$/', $raw) ? $raw : null;
}

function nickname($raw): string
{
    if (!is_string($raw)) {
        fail(400, 'Pick a nickname.');
    }
    $name = trim((string) preg_replace('/\s+/u', ' ', $raw));
    if (!preg_match("/^[\\p{L}\\p{N} _.'-]{1,20}$/u", $name)) {
        fail(400, "Nicknames are 1 to 20 letters, numbers, spaces, or . _ - '");
    }
    if (isOffensive($name)) {
        fail(400, 'Please pick a different nickname.');
    }
    return $name;
}

// A basic filter, not a complete one. Folds common letter swaps (sh1t, @ss) first.
function isOffensive(string $name): bool
{
    $lower = function_exists('mb_strtolower') ? mb_strtolower($name) : strtolower($name);
    $folded = strtr($lower, ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '7' => 't', '@' => 'a', '$' => 's']);
    $squashed = preg_replace('/[^a-z]/', '', $folded);
    // Blocked anywhere in the name.
    $anywhere = ['fuck', 'shit', 'cunt', 'nigg', 'faggot', 'rapist', 'nazi', 'hitler', 'whore', 'slut', 'bitch',
        'pussy', 'penis', 'vagina', 'porn', 'retard', 'kike', 'tranny', 'twat', 'wank', 'dildo', 'asshole', 'jizz'];
    foreach ($anywhere as $word) {
        if (strpos($squashed, $word) !== false) {
            return true;
        }
    }
    // Blocked only as a whole word, since they hide inside normal words (peacock, spice).
    $words = preg_split('/[^a-z]+/', $folded, -1, PREG_SPLIT_NO_EMPTY);
    $whole = ['fag', 'cock', 'dick', 'cum', 'spic', 'chink', 'rape', 'ass', 'tits', 'sex', 'kkk'];
    return (bool) array_intersect($words, $whole);
}

// Same scoring as game.js: 3 per correct answer, +2 for a deep cut, +1 from the
// third correct answer in a row.
function scoreRounds($rounds): array
{
    if (!is_array($rounds) || count($rounds) !== ROUNDS || array_keys($rounds) !== range(0, ROUNDS - 1)) {
        fail(400, 'A game is ' . ROUNDS . ' rounds.');
    }
    $score = $correct = $streak = 0;
    foreach ($rounds as $round) {
        $isCorrect = is_array($round) && ($round['correct'] ?? null) === true;
        $isDeep = is_array($round) && ($round['deep'] ?? false) === true;
        if ($isDeep && !$isCorrect) {
            fail(400, 'Bad round.');
        }
        if ($isCorrect) {
            $score += POINTS + ($isDeep ? DEEP_BONUS : 0) + ($streak >= 2 ? 1 : 0);
            $streak++;
            $correct++;
        } else {
            $streak = 0;
        }
    }
    return [$score, $correct];
}

// ---------- Reading ----------

const BOARD_WHERE = 'kind = ? AND mode = ? AND category = ? AND period = ?';

function boardParams(array $b): array
{
    return [$b['kind'], $b['mode'], $b['category'], $b['period']];
}

function findRow(PDO $db, array $b, string $player): ?array
{
    $st = $db->prepare('SELECT id, nickname, score, correct, achieved_at FROM scores WHERE ' . BOARD_WHERE . ' AND player = ?');
    $st->execute(array_merge(boardParams($b), [$player]));
    return $st->fetch() ?: null;
}

// Higher score first; on a tie, whoever got there first.
function rankOf(PDO $db, array $b, array $row): int
{
    $st = $db->prepare('SELECT COUNT(*) FROM scores WHERE ' . BOARD_WHERE .
        ' AND (score > ? OR (score = ? AND (achieved_at < ? OR (achieved_at = ? AND id < ?))))');
    $st->execute(array_merge(boardParams($b), [$row['score'], $row['score'], $row['achieved_at'], $row['achieved_at'], $row['id']]));
    return (int) $st->fetchColumn() + 1;
}

// The top of the board, plus the asking player's own row. Player IDs are never sent back.
function readBoard(PDO $db, array $b, ?string $player): array
{
    $st = $db->prepare('SELECT player, nickname, score, correct FROM scores WHERE ' . BOARD_WHERE .
        ' ORDER BY score DESC, achieved_at ASC, id ASC LIMIT ' . TOP_N);
    $st->execute(boardParams($b));
    $top = [];
    foreach ($st->fetchAll() as $i => $row) {
        $top[] = [
            'rank' => $i + 1,
            'nickname' => $row['nickname'],
            'score' => (int) $row['score'],
            'correct' => (int) $row['correct'],
            'you' => $player !== null && hash_equals($row['player'], $player),
        ];
    }
    $me = null;
    $mine = $player ? findRow($db, $b, $player) : null;
    if ($mine) {
        $me = [
            'rank' => rankOf($db, $b, $mine),
            'nickname' => $mine['nickname'],
            'score' => (int) $mine['score'],
            'correct' => (int) $mine['correct'],
            'you' => true,
        ];
    }
    return ['board' => $b, 'top' => $top, 'me' => $me];
}

// ---------- Submitting ----------

function rateLimit(PDO $db, array $config): void
{
    $ipHash = hash('sha256', ($config['ip_salt'] ?? '') . ($_SERVER['REMOTE_ADDR'] ?? ''));
    $now = gmdate('Y-m-d H:i:s');
    $st = $db->prepare('SELECT COUNT(*) FROM submissions WHERE ip_hash = ? AND created_at > ?');
    $st->execute([$ipHash, gmdate('Y-m-d H:i:s', time() - 3600)]);
    if ((int) $st->fetchColumn() >= MAX_SUBMISSIONS_PER_HOUR) {
        fail(429, 'Too many scores from your connection. Try again in a bit.');
    }
    $db->prepare('INSERT INTO submissions (ip_hash, created_at) VALUES (?, ?)')->execute([$ipHash, $now]);
    if (random_int(1, 100) === 1) {
        $db->prepare('DELETE FROM submissions WHERE created_at < ?')->execute([gmdate('Y-m-d H:i:s', time() - 86400)]);
    }
}

function submit(PDO $db, array $config, array $in): array
{
    $b = board($in);
    $player = player($in['player'] ?? null);
    if (!$player) {
        fail(400, 'Missing player ID.');
    }
    $nickname = nickname($in['nickname'] ?? null);
    [$score, $correct] = scoreRounds($in['rounds'] ?? null);

    // Allow yesterday too, for a game started just before midnight UTC.
    if ($b['kind'] === 'daily' && !in_array($b['period'], [gmdate('Y-m-d'), gmdate('Y-m-d', time() - 86400)], true)) {
        fail(400, "That daily challenge is over.");
    }

    rateLimit($db, $config);
    $now = gmdate('Y-m-d H:i:s');
    $previous = findRow($db, $b, $player);

    if ($b['kind'] === 'daily') {
        if ($previous) {
            fail(409, "You've already played today's challenge.");
        }
        try {
            $db->prepare('INSERT INTO scores (kind, mode, category, period, player, nickname, score, correct, achieved_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute(array_merge(boardParams($b), [$player, $nickname, $score, $correct, $now]));
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') { // two submissions raced each other
                fail(409, "You've already played today's challenge.");
            }
            throw $e;
        }
    } elseif (!$previous) {
        $db->prepare('INSERT INTO scores (kind, mode, category, period, player, nickname, score, correct, achieved_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute(array_merge(boardParams($b), [$player, $nickname, $score, $correct, $now]));
    } elseif ($score > (int) $previous['score']) {
        $db->prepare('UPDATE scores SET nickname = ?, score = ?, correct = ?, achieved_at = ? WHERE id = ?')
            ->execute([$nickname, $score, $correct, $now, $previous['id']]);
    } else {
        // Not a new best; just pick up a changed nickname.
        $db->prepare('UPDATE scores SET nickname = ? WHERE id = ?')->execute([$nickname, $previous['id']]);
    }

    $result = readBoard($db, $b, $player);
    $result['score'] = $score;
    $result['newBest'] = !$previous || $score > (int) $previous['score'];
    return $result;
}

// ---------- Main ----------

try {
    $config = loadConfig();
    $db = connect($config);
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'GET') {
        respond(200, readBoard($db, board($_GET), player($_GET['player'] ?? null)));
    }
    if ($method === 'POST') {
        $in = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($in)) {
            fail(400, 'Bad request.');
        }
        respond(200, submit($db, $config, $in));
    }
    header('Allow: GET, POST');
    fail(405, 'Method not allowed.');
} catch (Throwable $e) {
    error_log('Leaderboard error: ' . $e->getMessage());
    fail(500, 'The leaderboard is having trouble. Try again later.');
}
