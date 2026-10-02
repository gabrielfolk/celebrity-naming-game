<?php
// Copy this file to your hosting account's home folder (one level ABOVE public_html,
// e.g. /home/<cpanel-user>/celebrity-game-config.php) and fill in the values.
// Keep it out of the web folder and out of git.

return [
    // From cPanel → MySQL Databases. GoDaddy prefixes names with your cPanel user,
    // e.g. abc123_celebs.
    'dsn' => 'mysql:host=localhost;dbname=CPANELUSER_celebs;charset=utf8mb4',
    'user' => 'CPANELUSER_celebs',
    'password' => 'CHANGE ME',

    // Any long random string. Used to hash IP addresses for rate limiting, so raw
    // IPs are never stored.
    'ip_salt' => 'CHANGE ME TO A LONG RANDOM STRING',
];
