#!/bin/bash
# Run by cPanel (see .cpanel.yml) from the repo folder: server/deploy.sh <site folder>
# Copies public/ into the site folder (adds and replaces, never deletes), then puts
# server/htaccess at the top of the folder's .htaccess, replacing the previous copy
# of that section and keeping everything else (cPanel writes its PHP setting there).
set -euo pipefail

site="${1:?usage: server/deploy.sh <site folder>}"
if [ ! -d "$site" ]; then
  echo "Missing $site. Create the domain in cPanel first (see DEPLOY.md)."
  exit 1
fi

/bin/cp -R public/. "$site/"

{
  cat server/htaccess
  if [ -f "$site/.htaccess" ]; then
    sed '/^# BEGIN whosthatceleb$/,/^# END whosthatceleb$/d' "$site/.htaccess"
  fi
} > "$site/.htaccess.new"
chmod 644 "$site/.htaccess.new"
mv "$site/.htaccess.new" "$site/.htaccess"
