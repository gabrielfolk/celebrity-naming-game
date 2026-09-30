# Who's That Celebrity?

A small browser game: you see a celebrity's photo and type their name.

**Play it here: https://gabrielfolk.github.io/celebrity-naming-game/**

## How to play

- Pick a category (Movies & TV, Music, Sports, Public Figures, or Everyone).
- Each game is 10 rounds, and you get 3 guesses per photo.
- A last name alone counts, and so do small typos.
- A correct answer scores 3 points. Each hint costs 1 point, but you always get at least 1. From your third correct answer in a row, each one earns a +1 streak bonus.

## Running locally

There's no build step or dependencies. Just open `index.html` in a browser.

## How it works

- `celebrities.js`: the list of celebrities by category. Each entry is a Wikipedia page title, plus any other names that count as correct.
- `game.js`: the game logic. It fetches photos from the Wikipedia REST API and checks answers.
- `index.html` / `style.css`: the page and its styling.

To add a celebrity, add their Wikipedia page title to a category in `celebrities.js`.

Photos come from Wikipedia / Wikimedia Commons.
