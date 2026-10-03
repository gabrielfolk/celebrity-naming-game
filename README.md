# Who's That Celebrity?

A browser game: you see a celebrity's photo and type their name.

**Play it here: https://whosthatceleb.com**

## Features

- **534 celebrities** across Movies & TV, Music, Sports, and Public Figures, with photos from Wikipedia.
- **Two difficulties:** Human (228 household names) and Perfect Human Specimen (306 people you'd recognize but might not be able to name).
- **Daily challenge:** the same 10 celebrities for everyone each day, one try per difficulty.
- **Deep cuts:** bonus points for answering with a lesser-known name, like Jimmy Donaldson for MrBeast.
- **Leaderboards:** one for each day's challenge, and one for each difficulty and category for random games.
- **Forgiving answers:** a last name alone counts, and so do small typos and missing accents.

## How to play

- Pick a difficulty. Human has the household names; Perfect Human Specimen is a separate set of character actors, older stars, directors, international athletes, world leaders, and more.
- Play the **daily challenge**, or pick a category (Movies & TV, Music, Sports, Public Figures, or Everyone) for a random game.
  - The daily challenge changes at midnight UTC. It counts as played once you start it, so leaving partway doesn't give you another try.
- Each game is 10 rounds, and you get one guess per photo. The next photo comes up on its own after a couple of seconds.
- A last name alone counts (unless two celebrities in that difficulty share it), and so do small typos.
- After each round you see the answer, including any deep-cut name, so you can learn it for next time.

### Scoring

| | Points |
|---|---|
| Correct answer | 3 |
| Deep cut (a lesser-known name, usually a real name, like Stefani Germanotta for Lady Gaga) | +2 |
| Streak bonus, from your third correct answer in a row | +1 |

The most a game can score is 58.

### Leaderboard

After a game, submit your score with a nickname.

- **Daily challenge:** one board per difficulty for each day. You get one submission per day.
- **Random games:** one board per difficulty and category. It keeps each player's best score.

The 🏆 Leaderboard button on the home page shows the top 20 on each board, and highlights your own row. If you're outside the top 20, your rank still shows.

## Running locally

To just play, open `public/index.html` in a browser. Everything works except the leaderboard.

For the full site with the leaderboard, run it in Docker (PHP, Apache and MySQL, like the real hosting):

```sh
docker compose up
```

Then open http://localhost:8080.

## Hosting

The site runs on GoDaddy cPanel hosting: plain HTML, CSS and JavaScript for the game, and one PHP file with a MySQL database for the leaderboard.

To deploy, push to `main`. Then in cPanel → Git Version Control, click **Update from Remote** and **Deploy HEAD Commit**. cPanel runs `server/deploy.sh` (via `.cpanel.yml`), which copies `public/` into the site's folder and adds the security rules. [DEPLOY.md](DEPLOY.md) has the one-time setup.

## Security

- **Database:** settings live in a file outside the web folder, never in git. The site's database user can only read and write rows, not change tables, and every query uses parameters, so input can't be run as database commands.
- **Scores:** the server works out each score from the round-by-round results instead of trusting the submitted total, and rejects impossible games.
- **Nicknames:** limited to letters, numbers, spaces and `. _ - '`, passed through a basic offensive-word filter, and shown to other players as plain text only.
- **Abuse:** each connection can submit at most 30 scores an hour. IP addresses are stored hashed, never raw.
- **Players:** each browser gets a random player ID so you can find yourself on the board. IDs are never shown to other players.
- **HTTP:** the site redirects to HTTPS and sends security headers: HSTS, a Content Security Policy that only allows this site, Wikipedia and Wikimedia, a frame block, and nosniff. It doesn't reveal the PHP version.
- **Deploy:** it only adds and replaces files, so it can't affect other sites on the same hosting account.

Scores come from the browser, so the leaderboard can't fully stop someone determined to fake one. The server checks make that harder, not impossible.

## How it works

Everything in `public/` is the website:

- `celebrities.js`: the list of celebrities by category. Each category has a `people` list (Human) and a `hard` list (Perfect Human Specimen). Each entry is a Wikipedia page title, plus any other popular names that count as correct (`aliases`) and any lesser-known names worth the deep-cut bonus (`deep`).
- `game.js`: the game logic. It fetches photos from the Wikipedia REST API, checks answers, runs the daily challenge (a shuffle seeded by the date, so everyone gets the same deck), and talks to the leaderboard.
- `index.html` / `style.css`: the page and its styling.
- `api/leaderboard.php`: the leaderboard API.

Outside `public/`:

- `server/schema.sql`: the database tables.
- `server/config.example.php`: the template for the database settings file.
- `.cpanel.yml` and `server/deploy.sh`: the deploy cPanel runs.
- `server/htaccess`: the HTTPS redirect and security headers. The deploy adds them to the site's `.htaccess` in a marked section and keeps everything else in that file, like cPanel's PHP setting.
- `docker-compose.yml` and `server/config.docker.php`: the local copy of the full site.

To add a celebrity, add their Wikipedia page title to a category's `people` or `hard` list in `public/celebrities.js`.

Photos come from Wikipedia / Wikimedia Commons.
