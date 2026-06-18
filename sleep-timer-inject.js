// Jellyfin Sleep Timer - Client-side injection script
// Adds a sleep timer button to the video player OSD and a settings panel

(function() {
    'use strict';

    const PLUGIN_ID = 'a3f1c7d2-8e4b-4f6a-9c1d-2b5e8a7f3d60';
    let sleepTimerInterval = null;
    let sleepTimerEnd = null;
    let sleepTimerMode = 'duration'; // 'duration' or 'episodes'
    let sleepTimerEpisodeCount = 0;
    let sleepTimerEpisodesPlayed = 0;

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
                    <button id="stModeDuration" style="flex:1;padding:8px;background:${sleepTimerMode==='duration'?'#0084ff':'#1a1a1a'};color:#fff;border:none;border-radius:4px;cursor:pointer">Time</button>
                    <button id="stModeEpisodes" style="flex:1;padding:8px;background:${sleepTimerMode==='episodes'?'#0084ff':'#1a1a1a'};color:#fff;border:none;border-radius:4px;cursor:pointer">Episodes</button>
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

            <div id="stEpisodesSection" style="margin-bottom:16px;display:none">
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
                    <button class="stEpPreset" data-eps="1" style="padding:6px 12px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:4px;cursor:pointer">1</button>
                    <button class="stEpPreset" data-eps="2" style="padding:6px 12px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:4px;cursor:pointer">2</button>
                    <button class="stEpPreset" data-eps="3" style="padding:6px 12px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:4px;cursor:pointer">3</button>
                    <button class="stEpPreset" data-eps="5" style="padding:6px 12px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:4px;cursor:pointer">5</button>
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                    <input type="number" id="stCustomEps" min="1" max="50" placeholder="Custom" style="width:80px;background:#1a1a1a;border:1px solid #333;color:#ddd;padding:6px;border-radius:4px" />
                    <span style="color:#888;font-size:0.85rem">episodes</span>
                    <button id="stStartEps" style="margin-left:auto;padding:6px 16px;background:#0084ff;color:#fff;border:none;border-radius:4px;cursor:pointer">Start</button>
                </div>
            </div>

            <div id="stActiveControls" style="display:${activeTimer > 0 ? 'block' : 'none'};margin-bottom:12px;padding-top:12px;border-top:1px solid #333">
                <div style="display:flex;gap:8px">
                    <button id="stAdd15" style="flex:1;padding:6px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:4px;cursor:pointer">+15m</button>
                    <button id="stAdd30" style="flex:1;padding:6px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:4px;cursor:pointer">+30m</button>
                    <button id="stCancel" style="flex:1;padding:6px;background:#d32f2f;color:#fff;border:none;border-radius:4px;cursor:pointer">Cancel</button>
                </div>
            </div>

            <div style="margin-top:12px;padding-top:12px;border-top:1px solid #333">
                <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;color:#888;cursor:pointer">
                    <input type="checkbox" id="stFadeVolume" checked style="transform:scale(1.2)" />
                    Fade volume before stopping
                </label>
            </div>
        `;

        document.body.appendChild(panel);

        // Mode toggle
        document.getElementById('stModeDuration').addEventListener('click', () => {
            sleepTimerMode = 'duration';
            document.getElementById('stModeDuration').style.background = '#0084ff';
            document.getElementById('stModeEpisodes').style.background = '#1a1a1a';
            document.getElementById('stDurationSection').style.display = 'block';
            document.getElementById('stEpisodesSection').style.display = 'none';
        });

        document.getElementById('stModeEpisodes').addEventListener('click', () => {
            sleepTimerMode = 'episodes';
            document.getElementById('stModeEpisodes').style.background = '#0084ff';
            document.getElementById('stModeDuration').style.background = '#1a1a1a';
            document.getElementById('stDurationSection').style.display = 'none';
            document.getElementById('stEpisodesSection').style.display = 'block';
        });

        // Preset duration buttons
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

        // Preset episode buttons
        document.querySelectorAll('.stEpPreset').forEach(btn => {
            btn.addEventListener('click', () => {
                startEpisodeTimer(parseInt(btn.dataset.eps));
                panel.remove();
            });
        });

        // Custom episodes
        document.getElementById('stStartEps').addEventListener('click', () => {
            const eps = parseInt(document.getElementById('stCustomEps').value);
            if (eps > 0) {
                startEpisodeTimer(eps);
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

    function startEpisodeTimer(episodes) {
        sleepTimerMode = 'episodes';
        sleepTimerEpisodeCount = episodes;
        sleepTimerEpisodesPlayed = 0;
        sleepTimerEnd = null;
        notify('Sleep timer: stop after ' + episodes + ' episode' + (episodes > 1 ? 's' : ''));
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
        sleepTimerMode = 'duration';
        sleepTimerEpisodeCount = 0;
        sleepTimerEpisodesPlayed = 0;
        const countdown = document.getElementById('sleepTimerCountdown');
        if (countdown) countdown.textContent = '';
        const activeControls = document.getElementById('stActiveControls');
        if (activeControls) activeControls.style.display = 'none';
    }

    function stopPlayback() {
        // Use Jellyfin's internal API client
        const ApiClient = window.ApiClient || (window.require && window.require(['lib/jellyfin-apiclient']));
        if (window.ApiClient) {
            // Send stop command via API
            fetch(ApiClient.serverAddress + '/Sessions/Playing/Stopped', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Emby-Token': ApiClient.accessToken()
                },
                body: JSON.stringify({})
            }).catch(() => {});

            // Also try the playstate command
            const sessions = ApiClient.getSessions ? ApiClient.getSessions() : null;
            if (sessions) {
                sessions.then(s => {
                    const session = s.find(x => x.UserId === ApiClient.getCurrentUserId());
                    if (session) {
                        fetch(ApiClient.serverAddress + '/Sessions/' + session.Id + '/Playing/Playstate', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-Emby-Token': ApiClient.accessToken()
                            },
                            body: JSON.stringify({ Command: 'Stop' })
                        }).catch(() => {});
                    }
                }).catch(() => {});
            }
        }

        // Fallback: simulate pressing the stop button
        const stopBtn = document.querySelector('.btnPause');
        if (stopBtn) {
            // Try to find and click the back/stop button
            const exitBtn = document.querySelector('.btnExit');
            if (exitBtn) exitBtn.click();
        }
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

    // Listen for playback stop events (for episode counting)
    document.addEventListener('viewshow', (e) => {
        if (sleepTimerMode === 'episodes' && sleepTimerEpisodeCount > 0) {
            // Check if we just left the video player
            const view = e.detail && e.detail.view;
            if (view && view.type !== 'video-osd') {
                sleepTimerEpisodesPlayed++;
                if (sleepTimerEpisodesPlayed >= sleepTimerEpisodeCount) {
                    stopPlayback();
                    cancelTimer();
                }
            }
        }
    });

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

    console.log('[SleepTimer] Injected. Looking for player OSD...');
})();