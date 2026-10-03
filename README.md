# Who's That Celebrity?

A small browser game: you see a celebrity's photo and type their name.

**Play it here: https://whosthatceleb.com**

## How to play

- Pick a difficulty. Human has the household names; Perfect Human Specimen is a separate set of people you'd probably recognize but might not be able to name: character actors, older stars, directors, international athletes, world leaders, and more.
- Play the **daily challenge**, the same 10 celebrities for everyone that day (one try per mode, new one at midnight UTC), or pick a category (Movies & TV, Music, Sports, Public Figures, or Everyone) for a random game.
- Each game is 10 rounds, and you get one guess per photo. The next photo comes up on its own after a couple of seconds.
- A last name alone counts, and so do small typos.
- A correct answer scores 3 points. From your third correct answer in a row, each one earns a +1 streak bonus.
- Some celebrities also go by a lesser-known name, usually their real name (Jimmy Donaldson for MrBeast, Stefani Germanotta for Lady Gaga). Answering with that name is a "deep cut" and earns +2.
- After a game, submit your score with a nickname. The 🏆 Leaderboard has a board for each day's challenge, and one per mode and category for random games that keeps each player's best.

## Running locally

To just play, open `public/index.html` in a browser. Everything works except the leaderboard.

For the full site with the leaderboard, run it in Docker (PHP, Apache and MySQL, like the real hosting):

```sh
docker compose up
```

Then open http://localhost:8080.

## Hosting

The site is hosted at whosthatceleb.com on GoDaddy cPanel hosting. cPanel's Git Version Control pulls this repo and copies `public/` into the site's folder (see `.cpanel.yml`). [DEPLOY.md](DEPLOY.md) has the one-time setup and how to deploy an update.

## How it works

Everything in `public/` is the website:

- `celebrities.js`: the list of celebrities by category. Each category has a `people` list (Human) and a `hard` list (Perfect Human Specimen). Each entry is a Wikipedia page title, plus any other popular names that count as correct (`aliases`) and any lesser-known names worth the deep-cut bonus (`deep`).
- `game.js`: the game logic. It fetches photos from the Wikipedia REST API and checks answers.
- `index.html` / `style.css`: the page and its styling.
- `api/leaderboard.php`: the leaderboard API. It works out each score from the round-by-round results instead of trusting the submitted total, rejects impossible games, limits submissions per connection, and filters nicknames.

Outside `public/`:

- `server/schema.sql`: the database tables.
- `server/config.example.php`: the template for the database settings, which live outside the web folder on the server.
- `.cpanel.yml` and `server/deploy.sh`: the deploy cPanel runs. It copies `public/` into the site's folder.
- `server/htaccess`: the HTTPS redirect and security headers. The deploy adds them to the site's `.htaccess` in a marked section and keeps everything else in that file, like cPanel's PHP setting.

Scores come from the browser, so the leaderboard can't fully stop someone determined to fake one. The server checks make that harder, not impossible.

To add a celebrity, add their Wikipedia page title to a category's `people` or `hard` list in `public/celebrities.js`.

Photos come from Wikipedia / Wikimedia Commons.
