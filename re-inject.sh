#!/bin/bash
# Re-inject sleep timer script after Jellyfin container restart
# Usage: run after docker restart jellyfin

docker exec jellyfin cp /jellyfin/jellyfin-web/index.html.bak /jellyfin/jellyfin-web/index.html.bak 2>/dev/null
docker cp /home/pirrot/.openclaw/workspace/jellyfin-sleep-timer/sleep-timer-inject.js jellyfin:/jellyfin/jellyfin-web/sleep-timer-inject.js
docker exec jellyfin sh -c 'sed "s|</body>|<script src=\"sleep-timer-inject.js\"></script></body>|" /jellyfin/jellyfin-web/index.html.bak > /jellyfin/jellyfin-web/index.html'
echo "Sleep timer script re-injected"
