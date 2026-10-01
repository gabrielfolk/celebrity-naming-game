# Who's That Celebrity?

A small browser game: you see a celebrity's photo and type their name.

**Play it here: https://gabrielfolk.github.io/celebrity-naming-game/**

## How to play

- Pick a difficulty. Human has the household names; Perfect Human Specimen is a separate set of people you'd probably recognize but might not be able to name: character actors, older stars, directors, international athletes, world leaders, and more.
- Pick a category (Movies & TV, Music, Sports, Public Figures, or Everyone).
- Each game is 10 rounds, and you get one guess per photo. The next photo comes up on its own after a couple of seconds.
- A last name alone counts, and so do small typos.
- A correct answer scores 3 points. From your third correct answer in a row, each one earns a +1 streak bonus.
- Some celebrities also go by a lesser-known name, usually their real name (Jimmy Donaldson for MrBeast, Stefani Germanotta for Lady Gaga). Answering with that name is a "deep cut" and earns +2.

## Running locally

There's no build step or dependencies. Just open `index.html` in a browser.

## How it works

- `celebrities.js`: the list of celebrities by category. Each category has a `people` list (Human) and a `hard` list (Perfect Human Specimen). Each entry is a Wikipedia page title, plus any other popular names that count as correct (`aliases`) and any lesser-known names worth the deep-cut bonus (`deep`).
- `game.js`: the game logic. It fetches photos from the Wikipedia REST API and checks answers.
- `index.html` / `style.css`: the page and its styling.

To add a celebrity, add their Wikipedia page title to a category's `people` or `hard` list in `celebrities.js`.

Photos come from Wikipedia / Wikimedia Commons.
