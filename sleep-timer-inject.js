// Jellyfin Sleep Timer - Client-side injection script
// Adds a sleep timer button to the video player OSD and a settings panel
// When timer reaches zero, shows "Are you still watching?" dialog instead of stopping immediately.
// Playback only stops if the dialog is dismissed or ignored.

(function() {
    'use strict';

    // Clean up any previous instance
    if (window.__sleepTimerCleanup) { window.__sleepTimerCleanup(); }

    var PLUGIN_ID = 'a3f1c7d2-8e4b-4f6a-9c1d-2b5e8a7f3d60';
    var sleepTimerInterval = null;
    var sleepTimerEnd = null;
    var popupShown = false;
    var popupTimeoutMs = 60000; // 60 seconds to respond before auto-stop

    // ------------------------------------------------------------------
    // Button creation and injection
    // ------------------------------------------------------------------

    function createSleepTimerButton() {
        var btn = document.createElement('button');
        btn.setAttribute('is', 'paper-icon-button-light');
        btn.className = 'btnSleepTimer autoSize';
        btn.title = 'Sleep Timer';
        btn.innerHTML = '<span class="xlargePaperIconButton material-icons" aria-hidden="true" style="font-size:1.8em">bedtime</span>';
        btn.addEventListener('click', showSleepTimerPanel);
        return btn;
    }

    function injectButton() {
        var osd = document.querySelector('.videoOsdBottom');
        if (!osd) return false;
        if (osd.querySelector('.btnSleepTimer')) return true;

        // Insert after the subtitles button
        var subtitleBtn = osd.querySelector('.btnSubtitles');
        if (subtitleBtn && subtitleBtn.parentNode) {
            subtitleBtn.parentNode.insertBefore(createSleepTimerButton(), subtitleBtn.nextSibling);
            return true;
        }

        // Fallback: append to the buttons row
        var buttonsRow = osd.querySelector('.osdButtons');
        if (buttonsRow) {
            buttonsRow.appendChild(createSleepTimerButton());
            return true;
        }

        return false;
    }

    // ------------------------------------------------------------------
    // Panel UI
    // ------------------------------------------------------------------

    function showSleepTimerPanel() {
        // Toggle: if panel is open, close it
        var existing = document.getElementById('sleepTimerPanel');
        if (existing) {
            existing.remove();
            return;
        }

        var autoCloseTimer = null;

        function startAutoClose() {
            if (autoCloseTimer) clearTimeout(autoCloseTimer);
            autoCloseTimer = setTimeout(function() {
                var p = document.getElementById('sleepTimerPanel');
                if (p) p.remove();
            }, 4000);
        }

        var activeTimer = sleepTimerEnd ? Math.max(0, Math.ceil((sleepTimerEnd - Date.now()) / 1000)) : 0;

        var panel = document.createElement('div');
        panel.id = 'sleepTimerPanel';
        panel.style.cssText = [
            'position:fixed',
            'bottom:120px',
            'right:20px',
            'background:rgba(16,16,16,0.95)',
            'border:1px solid #333',
            'border-radius:8px',
            'padding:20px',
            'z-index:9999',
            'color:#ddd',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
            'min-width:280px',
            'box-shadow:0 4px 20px rgba(0,0,0,0.5)'
        ].join(';');

        panel.innerHTML = [
            '<div style="font-size:1.2rem;font-weight:600;margin-bottom:16px;color:#fff;display:flex;justify-content:space-between;align-items:center">',
                '<span>Sleep Timer</span>',
                activeTimer > 0
                    ? '<span id="sleepTimerCountdown" style="font-size:1rem;color:#0084ff">' + formatTime(activeTimer) + '</span>'
                    : '',
            '</div>',

            '<div id="stDurationSection" style="margin-bottom:16px">',
                '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px">',
                    '<button class="stPreset" data-mins="15" style="padding:10px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:6px;cursor:pointer;font-size:0.95rem">15m</button>',
                    '<button class="stPreset" data-mins="30" style="padding:10px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:6px;cursor:pointer;font-size:0.95rem">30m</button>',
                    '<button class="stPreset" data-mins="45" style="padding:10px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:6px;cursor:pointer;font-size:0.95rem">45m</button>',
                    '<button class="stPreset" data-mins="60" style="padding:10px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:6px;cursor:pointer;font-size:0.95rem">1h</button>',
                    '<button class="stPreset" data-mins="90" style="padding:10px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:6px;cursor:pointer;font-size:0.95rem">1.5h</button>',
                    '<button class="stPreset" data-mins="120" style="padding:10px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:6px;cursor:pointer;font-size:0.95rem">2h</button>',
                '</div>',
            '</div>',

            '<div id="stActiveControls" style="display:' + (activeTimer > 0 ? 'block' : 'none') + ';margin-bottom:12px;padding-top:12px;border-top:1px solid #333">',
                '<div style="display:flex;gap:8px">',
                    '<button id="stAdd15" style="flex:1;padding:8px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:6px;cursor:pointer">+15m</button>',
                    '<button id="stAdd30" style="flex:1;padding:8px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:6px;cursor:pointer">+30m</button>',
                    '<button id="stCancel" style="flex:1;padding:8px;background:#d32f2f;color:#fff;border:none;border-radius:6px;cursor:pointer">Cancel</button>',
                '</div>',
            '</div>'
        ].join('');

        document.body.appendChild(panel);

        // Auto-close after 4 seconds of inactivity
        panel.addEventListener('click', startAutoClose);
        startAutoClose();

        // Preset duration buttons
        var presetBtns = panel.querySelectorAll('.stPreset');
        for (var i = 0; i < presetBtns.length; i++) {
            presetBtns[i].addEventListener('click', function() {
                if (autoCloseTimer) clearTimeout(autoCloseTimer);
                startDurationTimer(parseInt(this.dataset.mins, 10));
                panel.remove();
            });
        }

        // Active timer controls
        if (activeTimer > 0) {
            document.getElementById('stAdd15').addEventListener('click', function() {
                sleepTimerEnd += 15 * 60 * 1000;
                updateCountdown();
            });
            document.getElementById('stAdd30').addEventListener('click', function() {
                sleepTimerEnd += 30 * 60 * 1000;
                updateCountdown();
            });
            document.getElementById('stCancel').addEventListener('click', function() {
                cancelTimer();
                panel.remove();
            });
        }
    }

    // ------------------------------------------------------------------
    // Timer logic
    // ------------------------------------------------------------------

    function formatTime(seconds) {
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = seconds % 60;
        if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        return m + ':' + String(s).padStart(2, '0');
    }

    function startDurationTimer(minutes) {
        sleepTimerEnd = Date.now() + minutes * 60 * 1000;
        popupShown = false;
        startCountdown();
        notify('Sleep timer started: ' + minutes + ' minutes');
    }

    function startCountdown() {
        if (sleepTimerInterval) clearInterval(sleepTimerInterval);
        sleepTimerInterval = setInterval(function() {
            updateCountdown();
            var remaining = sleepTimerEnd - Date.now();
            if (remaining <= 0) {
                clearInterval(sleepTimerInterval);
                sleepTimerInterval = null;
                if (!popupShown) {
                    popupShown = true;
                    showStillWatchingPopup();
                }
            } else if (remaining <= 10000 && remaining > 9000) {
                notify('Playback stopping in 10 seconds...');
            }
        }, 1000);
    }

    function updateCountdown() {
        var countdown = document.getElementById('sleepTimerCountdown');
        if (countdown && sleepTimerEnd) {
            var remaining = Math.max(0, Math.ceil((sleepTimerEnd - Date.now()) / 1000));
            countdown.textContent = formatTime(remaining);
        }
    }

    function cancelTimer() {
        if (sleepTimerInterval) {
            clearInterval(sleepTimerInterval);
            sleepTimerInterval = null;
        }
        sleepTimerEnd = null;
        popupShown = false;
        var countdown = document.getElementById('sleepTimerCountdown');
        if (countdown) countdown.textContent = '';
        var activeControls = document.getElementById('stActiveControls');
        if (activeControls) activeControls.style.display = 'none';

        // Remove any open popup
        var popup = document.getElementById('sleepTimerPopup');
        if (popup) popup.remove();
    }

    // ------------------------------------------------------------------
    // "Are you still watching?" popup
    // ------------------------------------------------------------------

    function showStillWatchingPopup() {
        // Remove any existing popup
        var existing = document.getElementById('sleepTimerPopup');
        if (existing) existing.remove();

        var popup = document.createElement('div');
        popup.id = 'sleepTimerPopup';
        popup.style.cssText = [
            'position:fixed',
            'top:50%',
            'left:50%',
            'transform:translate(-50%,-50%)',
            'background:rgba(16,16,16,0.97)',
            'border:1px solid #333',
            'border-radius:12px',
            'padding:32px 40px',
            'z-index:10000',
            'color:#ddd',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
            'text-align:center',
            'min-width:340px',
            'box-shadow:0 8px 40px rgba(0,0,0,0.7)'
        ].join(';');

        popup.innerHTML = [
            '<div style="font-size:2.5rem;margin-bottom:12px;color:#0084ff">bedtime</div>',
            '<div style="font-size:1.4rem;font-weight:600;color:#fff;margin-bottom:8px">Are you still watching?</div>',
            '<div style="font-size:0.9rem;color:#888;margin-bottom:24px">Playback will stop in <span id="popupCountdown">60</span> seconds.</div>',
            '<button id="popupContinue" style="padding:12px 32px;background:#0084ff;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem;font-weight:500">Continue Watching</button>',
            '<button id="popupStop" style="margin-left:12px;padding:12px 24px;background:transparent;color:#888;border:1px solid #333;border-radius:8px;cursor:pointer;font-size:0.9rem">Stop Now</button>'
        ].join('');

        // Set the bedtime icon properly (the text "bedtime" above is a placeholder)
        var iconSpan = popup.querySelector('div[style*="font-size:2.5rem"]');
        if (iconSpan) {
            iconSpan.innerHTML = '<span class="material-icons" style="font-size:2.5rem">bedtime</span>';
        }

        document.body.appendChild(popup);

        // Countdown for the popup
        var popupSeconds = Math.floor(popupTimeoutMs / 1000);
        var popupInterval = setInterval(function() {
            popupSeconds--;
            var el = document.getElementById('popupCountdown');
            if (el) el.textContent = popupSeconds;
            if (popupSeconds <= 0) {
                clearInterval(popupInterval);
                var p = document.getElementById('sleepTimerPopup');
                if (p) p.remove();
                stopPlayback();
                cancelTimer();
            }
        }, 1000);

        // Continue button: dismiss popup, reset timer state
        document.getElementById('popupContinue').addEventListener('click', function() {
            clearInterval(popupInterval);
            var p = document.getElementById('sleepTimerPopup');
            if (p) p.remove();
            // Reset so the user can start a new timer from the panel
            cancelTimer();
            notify('Sleep timer cancelled -- enjoy your show!');
        });

        // Stop button: stop immediately
        document.getElementById('popupStop').addEventListener('click', function() {
            clearInterval(popupInterval);
            var p = document.getElementById('sleepTimerPopup');
            if (p) p.remove();
            stopPlayback();
            cancelTimer();
        });

        // Also stop on popup dismiss (clicking outside, Escape key)
        popup.addEventListener('click', function(e) {
            if (e.target === popup) {
                // Clicked on the overlay itself, not a child -- treat as dismiss
            }
        });

        document.addEventListener('keydown', function onEsc(e) {
            if (e.key === 'Escape') {
                // Escape dismisses the popup but does NOT stop playback
                // (user might have accidentally pressed it)
                clearInterval(popupInterval);
                var p = document.getElementById('sleepTimerPopup');
                if (p) p.remove();
                cancelTimer();
                notify('Sleep timer dismissed');
                document.removeEventListener('keydown', onEsc);
            }
        });
    }

    // ------------------------------------------------------------------
    // Stop playback
    // ------------------------------------------------------------------

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

        // Build sessions URL using apiClient.getUrl() for correct base path
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
            var mySession = null;
            for (var i = 0; i < sessions.length; i++) {
                if (sessions[i].UserId === userId && sessions[i].NowPlayingItem != null) {
                    mySession = sessions[i];
                    break;
                }
            }
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

    // ------------------------------------------------------------------
    // Notifications
    // ------------------------------------------------------------------

    function notify(message) {
        if (window.require) {
            window.require(['toast'], function(toast) {
                toast(message);
            });
        } else {
            console.log('[SleepTimer] ' + message);
        }
    }

    // ------------------------------------------------------------------
    // Button injection: poll + observe
    // ------------------------------------------------------------------

    var injectInterval = setInterval(function() {
        if (injectButton()) {
            clearInterval(injectInterval);
        }
    }, 1000);

    var observer = new MutationObserver(function() {
        if (document.querySelector('.videoOsdBottom') && !document.querySelector('.btnSleepTimer')) {
            injectButton();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.__sleepTimerObserver = observer;

    // ------------------------------------------------------------------
    // Cleanup function (used by reinstall/uninstall)
    // ------------------------------------------------------------------

    window.__sleepTimerCleanup = function() {
        if (sleepTimerInterval) clearInterval(sleepTimerInterval);
        sleepTimerInterval = null;
        sleepTimerEnd = null;
        popupShown = false;

        if (window.__sleepTimerObserver) {
            window.__sleepTimerObserver.disconnect();
            window.__sleepTimerObserver = null;
        }

        var oldBtn = document.querySelector('.btnSleepTimer');
        if (oldBtn) oldBtn.remove();

        var oldPanel = document.getElementById('sleepTimerPanel');
        if (oldPanel) oldPanel.remove();

        var oldPopup = document.getElementById('sleepTimerPopup');
        if (oldPopup) oldPopup.remove();

        console.log('[SleepTimer] Cleaned up previous instance');
    };

    console.log('[SleepTimer] Injected. Looking for player OSD...');
})();