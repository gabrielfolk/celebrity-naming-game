<?php
// Settings for the local Docker setup (docker-compose.yml). Not used on the real site.
return [
    'dsn' => 'mysql:host=db;dbname=celebs;charset=utf8mb4',
    'user' => 'celebs',
    'password' => 'celebs',
    'ip_salt' => 'local',
];
