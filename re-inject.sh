#!/bin/bash
# Re-inject sleep timer autoloader after Jellyfin container restart
# Run this after each container restart

docker cp /home/pirrot/.openclaw/workspace/jellyfin-sleep-timer/sleeptimer-autoloader.js jellyfin:/jellyfin/jellyfin-web/sleeptimer-autoloader.js
docker exec jellyfin sh -c 'cat /jellyfin/jellyfin-web/index.html | grep -q sleeptimer-autoloader || sed "s|</body>|<script src=\"sleeptimer-autoloader.js\"></script></body>|" /jellyfin/jellyfin-web/index.html > /tmp/index.html && mv /tmp/index.html /jellyfin/jellyfin-web/index.html'
echo "Sleep timer autoloader injected"