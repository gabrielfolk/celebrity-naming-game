# Deploying to GoDaddy

The site runs at **whosthatceleb.com** on GoDaddy cPanel hosting (Deluxe): the game files
plus a PHP leaderboard backed by MySQL. cPanel's **Git Version Control** pulls this repo
from GitHub and copies `public/` into the domain's folder, following [`.cpanel.yml`](.cpanel.yml).

## One-time setup

### 1. Add the domain

cPanel → **Domains → Create A New Domain**:

- Domain: `whosthatceleb.com`
- **Uncheck** "Share document root with campiongradsrugby.ca"
- Document root: `whosthatceleb.com` (so it's `/home/<cpanel-user>/whosthatceleb.com`, next to
  `public_html`, not inside it)

### 2. Point the domain at the hosting

GoDaddy → **My Products → whosthatceleb.com → DNS**. Set the **A** record for `@` to the
hosting server's IP (`107.180.26.79`). Leave the `www` CNAME pointing to `@`.

### 3. Turn on HTTPS

Once the domain points at the hosting (usually within minutes): cPanel → **Security →
SSL/TLS Status**, select `whosthatceleb.com` and `www.whosthatceleb.com`, click **Run AutoSSL**.

### 4. Check the PHP version

cPanel → **Software → MultiPHP Manager**. Set `whosthatceleb.com` to PHP 8.1 or newer.

### 5. Create the database

1. cPanel → **Databases → MySQL Databases**.
2. Create a database (for example `celebs`). GoDaddy adds your cPanel username as a prefix,
   so the full name looks like `abc123_celebs`.
3. Create a user with a strong password.
4. Add the user to the database with **All Privileges**.
5. cPanel → **phpMyAdmin**, select the database, open the **SQL** tab, paste the contents of
   [`server/schema.sql`](server/schema.sql) and click **Go**.

### 6. Add the config file

1. cPanel → **File Manager**, go to your home folder (`/home/<cpanel-user>`, the one that
   contains `public_html`).
2. Create a file named `celebrity-game-config.php`.
3. Paste in [`server/config.example.php`](server/config.example.php) and fill in the
   database name, user, password, and a long random `ip_salt`.
4. Set its permissions to `600`.

It sits outside every website folder, so it can't be downloaded, and it's never in git.

### 7. Connect the repo

cPanel → **Files → Git Version Control → Create**:

- **Clone a Repository:** on
- **Clone URL:** `https://github.com/gabrielfolk/celebrity-naming-game.git`
- **Repository Path:** `repositories/celebrity-naming-game`
- **Repository Name:** `celebrity-naming-game`

Click **Create**. Then deploy it as below.

## Deploying an update

1. Push your changes to `main` on GitHub.
2. cPanel → **Git Version Control** → **Manage** next to `celebrity-naming-game` →
   **Pull or Deploy** tab.
3. Click **Update from Remote**, then **Deploy HEAD Commit**.
4. Open https://whosthatceleb.com and check that the game and the 🏆 Leaderboard load.

The deploy only adds and replaces files. If you delete or rename a file in `public/`, also
delete the old copy from `whosthatceleb.com/` in File Manager.

## If something goes wrong

- **"Deploy HEAD Commit" is greyed out.** The repo needs `.cpanel.yml` at its root and no
  uncommitted changes on the server. Don't edit files inside `repositories/`; change them in
  git and push.
- **Deploy fails with "Missing …/whosthatceleb.com".** Do step 1 first. The deploy log is in
  `.cpanel/logs/` in your home folder.
- **"The leaderboard is not set up yet."** The config file isn't in the home folder or has
  the wrong name.
- **"The leaderboard is having trouble."** Usually wrong database details. The real error is
  in `error_log` inside `whosthatceleb.com/api/` (File Manager).
