// Jellyfin Sleep Timer - Client-side injection script
// Adds a sleep timer button to the video player OSD and a settings panel

(function() {
    'use strict';

    // Clean up any previous instance
    if (window.__sleepTimerCleanup) { window.__sleepTimerCleanup(); }

    const PLUGIN_ID = 'a3f1c7d2-8e4b-4f6a-9c1d-2b5e8a7f3d60';
    let sleepTimerInterval = null;
    let sleepTimerEnd = null;

    // Create the sleep timer button for the OSD
    function createSleepTimerButton() {
        const btn = document.createElement('button');
        btn.setAttribute('is', 'paper-icon-button-light');
        btn.className = 'btnSleepTimer autoSize';
        btn.title = 'Sleep Timer';
        btn.innerHTML = '<span class="xlargePaperIconButton material-icons" aria-hidden="true" style="font-size:1.8em">bedtime</span>';
        btn.addEventListener('click', showSleepTimerPanel);
        return btn;
    }

    // Inject the button into the player OSD
    function injectButton() {
        const osd = document.querySelector('.videoOsdBottom');
        if (!osd) return false;

        if (osd.querySelector('.btnSleepTimer')) return true;

        // Insert after the subtitles button
        const subtitleBtn = osd.querySelector('.btnSubtitles');
        if (subtitleBtn && subtitleBtn.parentNode) {
            subtitleBtn.parentNode.insertBefore(createSleepTimerButton(), subtitleBtn.nextSibling);
            return true;
        }

        // Fallback: append to the buttons row
        const buttonsRow = osd.querySelector('.osdButtons');
        if (buttonsRow) {
            buttonsRow.appendChild(createSleepTimerButton());
            return true;
        }

        return false;
    }

    // Show the sleep timer panel
    function showSleepTimerPanel() {
        const existing = document.getElementById('sleepTimerPanel');
        if (existing) {
            existing.remove();
            return;
        }

        const panel = document.createElement('div');
        panel.id = 'sleepTimerPanel';
        panel.style.cssText = `
            position: fixed;
            bottom: 120px;
            right: 20px;
            background: rgba(16,16,16,0.95);
            border: 1px solid #333;
            border-radius: 8px;
            padding: 20px;
            z-index: 9999;
            color: #ddd;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            min-width: 280px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        `;

        const activeTimer = sleepTimerEnd ? Math.max(0, Math.ceil((sleepTimerEnd - Date.now()) / 1000)) : 0;

        panel.innerHTML = `
            <div style="font-size:1.2rem;font-weight:600;margin-bottom:16px;color:#fff;display:flex;justify-content:space-between;align-items:center">
                <span>Sleep Timer</span>
                ${activeTimer > 0 ? `<span id="sleepTimerCountdown" style="font-size:1rem;color:#0084ff">${formatTime(activeTimer)}</span>` : ''}
            </div>

            <div style="margin-bottom:12px">
                <div style="display:flex;gap:8px;margin-bottom:12px">
                    <button id="stModeDuration" style="flex:1;padding:8px;background:#0084ff;color:#fff;border:none;border-radius:4px;cursor:pointer">Time</button>
                </div>
            </div>

            <div id="stDurationSection" style="margin-bottom:16px">
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
                    <button class="stPreset" data-mins="15" style="padding:6px 12px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:4px;cursor:pointer">15m</button>
                    <button class="stPreset" data-mins="30" style="padding:6px 12px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:4px;cursor:pointer">30m</button>
                    <button class="stPreset" data-mins="45" style="padding:6px 12px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:4px;cursor:pointer">45m</button>
                    <button class="stPreset" data-mins="60" style="padding:6px 12px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:4px;cursor:pointer">1h</button>
                    <button class="stPreset" data-mins="90" style="padding:6px 12px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:4px;cursor:pointer">1.5h</button>
                    <button class="stPreset" data-mins="120" style="padding:6px 12px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:4px;cursor:pointer">2h</button>
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                    <input type="number" id="stCustomMins" min="1" max="600" placeholder="Custom" style="width:80px;background:#1a1a1a;border:1px solid #333;color:#ddd;padding:6px;border-radius:4px" />
                    <span style="color:#888;font-size:0.85rem">minutes</span>
                    <button id="stStartCustom" style="margin-left:auto;padding:6px 16px;background:#0084ff;color:#fff;border:none;border-radius:4px;cursor:pointer">Start</button>
                </div>
            </div>

            <div id="stEpisodesSection" style="display:none">
            </div>

            <div id="stActiveControls" style="display:${activeTimer > 0 ? 'block' : 'none'};margin-bottom:12px;padding-top:12px;border-top:1px solid #333">
                <div style="display:flex;gap:8px">
                    <button id="stAdd15" style="flex:1;padding:6px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:4px;cursor:pointer">+15m</button>
                    <button id="stAdd30" style="flex:1;padding:6px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:4px;cursor:pointer">+30m</button>
                    <button id="stCancel" style="flex:1;padding:6px;background:#d32f2f;color:#fff;border:none;border-radius:4px;cursor:pointer">Cancel</button>
                </div>
            </div>

            <div style="margin-top:12px;padding-top:12px;border-top:1px solid #333">
            </div>
        `;

        document.body.appendChild(panel);

        // Duration presets
        document.querySelectorAll('.stPreset').forEach(btn => {
            btn.addEventListener('click', () => {
                startDurationTimer(parseInt(btn.dataset.mins));
                panel.remove();
            });
        });

        // Custom duration
        document.getElementById('stStartCustom').addEventListener('click', () => {
            const mins = parseInt(document.getElementById('stCustomMins').value);
            if (mins > 0) {
                startDurationTimer(mins);
                panel.remove();
            }
        });

        // Active timer controls
        if (activeTimer > 0) {
            document.getElementById('stAdd15').addEventListener('click', () => {
                sleepTimerEnd += 15 * 60 * 1000;
                updateCountdown();
            });
            document.getElementById('stAdd30').addEventListener('click', () => {
                sleepTimerEnd += 30 * 60 * 1000;
                updateCountdown();
            });
            document.getElementById('stCancel').addEventListener('click', () => {
                cancelTimer();
                panel.remove();
            });
        }
    }

    function formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        return `${m}:${String(s).padStart(2,'0')}`;
    }

    function startDurationTimer(minutes) {
        sleepTimerEnd = Date.now() + minutes * 60 * 1000;
        sleepTimerMode = 'duration';
        startCountdown();
        notify('Sleep timer started: ' + minutes + ' minutes');
    }

    function startCountdown() {
        if (sleepTimerInterval) clearInterval(sleepTimerInterval);
        sleepTimerInterval = setInterval(() => {
            updateCountdown();
            const remaining = sleepTimerEnd - Date.now();
            if (remaining <= 0) {
                stopPlayback();
                cancelTimer();
            } else if (remaining <= 10000 && remaining > 9000) {
                notify('Playback stopping in 10 seconds...');
            }
        }, 1000);
    }

    function updateCountdown() {
        const countdown = document.getElementById('sleepTimerCountdown');
        if (countdown && sleepTimerEnd) {
            const remaining = Math.max(0, Math.ceil((sleepTimerEnd - Date.now()) / 1000));
            countdown.textContent = formatTime(remaining);
        }
    }

    function cancelTimer() {
        if (sleepTimerInterval) {
            clearInterval(sleepTimerInterval);
            sleepTimerInterval = null;
        }
        sleepTimerEnd = null;
        const countdown = document.getElementById('sleepTimerCountdown');
        if (countdown) countdown.textContent = '';
        const activeControls = document.getElementById('stActiveControls');
        if (activeControls) activeControls.style.display = 'none';
    }

    function stopPlayback() {
        console.log('[SleepTimer] Attempting to stop playback...');
        var apiClient = window.ApiClient;
        if (!apiClient) {
            console.error('[SleepTimer] No ApiClient available');
            var exitBtn = document.querySelector('.btnExit');
            if (exitBtn) { console.log('[SleepTimer] Clicking btnExit'); exitBtn.click(); }
            return;
        }

        var token = apiClient.accessToken();
        var userId = apiClient.getCurrentUserId();
        console.log('[SleepTimer] token:', token ? token.substring(0,8)+'...' : 'NONE', 'userId:', userId);

        // Use apiClient.getUrl() to build the URL correctly
        var sessionsUrl = apiClient.getUrl('Sessions');
        console.log('[SleepTimer] Sessions URL:', sessionsUrl);

        // Method 1: Find active session and send Stop command
        fetch(sessionsUrl, {
            headers: { 'X-Emby-Token': token }
        })
        .then(function(r) { 
            console.log('[SleepTimer] Sessions response:', r.status, r.statusText);
            if (!r.ok) throw new Error('Sessions request failed: ' + r.status);
            return r.json(); 
        })
        .then(function(sessions) {
            console.log('[SleepTimer] Found', sessions.length, 'sessions');
            var mySession = sessions.find(function(s) {
                return s.UserId === userId && s.NowPlayingItem != null;
            });
            if (mySession) {
                console.log('[SleepTimer] Found active session:', mySession.Id, 'playing:', mySession.NowPlayingItem.Name);
                var stopUrl = apiClient.getUrl('Sessions/' + mySession.Id + '/Playing/Stop');
                console.log('[SleepTimer] Stop URL:', stopUrl);
                fetch(stopUrl, {
                    method: 'POST',
                    headers: { 'X-Emby-Token': token }
                })
                .then(function(r) { console.log('[SleepTimer] Stop response:', r.status, r.statusText); })
                .catch(function(e) { console.error('[SleepTimer] Stop failed:', e); });
            } else {
                console.log('[SleepTimer] No active playing session found');
                // List all sessions for this user for debugging
                sessions.forEach(function(s) {
                    if (s.UserId === userId) {
                        console.log('[SleepTimer] Session:', s.Id, 'Device:', s.DeviceName, 'Playing:', !!s.NowPlayingItem);
                    }
                });
            }
        })
        .catch(function(e) { console.error('[SleepTimer] Session lookup failed:', e); });

        // Method 2: DOM fallback after delay
        setTimeout(function() {
            console.log('[SleepTimer] Trying DOM fallback');
            var exitBtn = document.querySelector('.btnExit');
            if (exitBtn) { console.log('[SleepTimer] Clicking btnExit'); exitBtn.click(); }
        }, 1000);
    }

    function notify(message) {
        // Use Jellyfin's toast notification system
        if (window.require) {
            window.require(['toast'], function(toast) {
                toast(message);
            });
        } else {
            console.log('[SleepTimer] ' + message);
        }
    }

    // Try to inject the button periodically when the player is open
    const injectInterval = setInterval(() => {
        if (injectButton()) {
            clearInterval(injectInterval);
        }
    }, 1000);

    // Re-inject when navigating back to player
    const observer = new MutationObserver(() => {
        if (document.querySelector('.videoOsdBottom') && !document.querySelector('.btnSleepTimer')) {
            injectButton();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.__sleepTimerObserver = observer;

    // Cleanup function for re-install
    window.__sleepTimerCleanup = function() {
        if (sleepTimerInterval) clearInterval(sleepTimerInterval);
        sleepTimerInterval = null;
        sleepTimerEnd = null;
        var observer2 = window.__sleepTimerObserver;
        if (observer2) observer2.disconnect();
        var oldBtn = document.querySelector('.btnSleepTimer');
        if (oldBtn) oldBtn.remove();
        var oldPanel = document.getElementById('sleepTimerPanel');
        if (oldPanel) oldPanel.remove();
        console.log('[SleepTimer] Cleaned up previous instance');
    };

    console.log('[SleepTimer] Injected. Looking for player OSD...');
})();