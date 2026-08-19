// Jellyfin Sleep Timer - Client-side injection script
// Adds a sleep timer button to the video player OSD and a settings panel.
// When timer reaches zero, shows "Are you still watching?" dialog.
// The server is the source of truth for timer state — the client calls
// the API for every action (start/extend/cancel/popup response) and
// syncs with the server on load in case the page was refreshed.

(function() {
    'use strict';

    // Clean up any previous instance
    if (window.__sleepTimerCleanup) { window.__sleepTimerCleanup(); }

    var sleepTimerInterval = null;
    var sleepTimerEnd = null;       // epoch ms, synced from server
    var currentSessionId = null;    // session ID from server
    var popupShown = false;
    var popupTimeoutMs = 60000;     // 60 seconds to respond before auto-stop
    var syncedFromServer = false;   // tracks whether we've done the initial sync

    // ------------------------------------------------------------------
    // API helpers
    // ------------------------------------------------------------------

    function getApiBase() {
        var api = window.ApiClient;
        if (!api && window.Connections && window.Connections.currentApiClient) {
            api = window.Connections.currentApiClient();
        }
        if (api && api.serverAddress) {
            return api.serverAddress().replace(/\/+$/, '');
        }
        return window.location ? window.location.origin : '';
    }

    function getAuthToken() {
        var api = window.ApiClient;
        if (!api && window.Connections && window.Connections.currentApiClient) {
            api = window.Connections.currentApiClient();
        }
        if (api && api.accessToken) return api.accessToken();
        return '';
    }

    function authHeaders() {
        return {
            'X-Emby-Token': getAuthToken(),
            'Content-Type': 'application/json'
        };
    }

    function getCurrentUserId() {
        var api = window.ApiClient;
        if (!api && window.Connections && window.Connections.currentApiClient) {
            api = window.Connections.currentApiClient();
        }
        if (api && api.getCurrentUserId) return api.getCurrentUserId();
        return null;
    }

    function apiPost(path, body) {
        return fetch(getApiBase() + path, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(body)
        }).then(function(r) {
            if (!r.ok) throw new Error(path + ' returned ' + r.status);
            return r.json();
        });
    }

    function apiDelete(path) {
        return fetch(getApiBase() + path, {
            method: 'DELETE',
            headers: authHeaders()
        }).then(function(r) {
            if (!r.ok) throw new Error(path + ' returned ' + r.status);
            return r.json();
        });
    }

    function apiGet(path) {
        return fetch(getApiBase() + path, {
            headers: authHeaders()
        }).then(function(r) {
            if (!r.ok) throw new Error(path + ' returned ' + r.status);
            return r.json();
        });
    }

    // ------------------------------------------------------------------
    // Server sync
    // ------------------------------------------------------------------

    // Sync with the server on load — if a timer is already running (e.g. after
    // page refresh), resume the countdown from the server's EndTime.
    function syncFromServer() {
        if (syncedFromServer) return;
        syncedFromServer = true;

        var userId = getCurrentUserId();
        if (!userId) return;

        apiGet('/SleepTimer/TimerByUser/' + userId)
            .then(function(data) {
                if (data && data.State === 'Running' && data.RemainingSeconds > 0) {
                    // Server has an active timer — sync to it
                    sleepTimerEnd = new Date(data.EndTime).getTime();
                    currentSessionId = data.SessionId;
                    popupShown = false;
                    startCountdown();
                    console.log('[SleepTimer] Synced from server: ' + data.RemainingSeconds + 's remaining, session ' + data.SessionId);
                } else if (data && data.State === 'PopupPending' && data.PopupRemainingSeconds > 0) {
                    // Timer expired while the page was loading — show the popup
                    sleepTimerEnd = new Date(data.EndTime).getTime();
                    currentSessionId = data.SessionId;
                    popupShown = true;
                    showStillWatchingPopup(data.PopupRemainingSeconds);
                    console.log('[SleepTimer] Synced from server: popup pending, ' + data.PopupRemainingSeconds + 's grace remaining');
                }
            })
            .catch(function(e) {
                // 404 means no timer — that's fine
                if (e.message && e.message.indexOf('404') === -1) {
                    console.error('[SleepTimer] Sync error:', e);
                }
            });
    }

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

    function createOsdCountdown() {
        var wrapper = document.createElement('div');
        wrapper.className = 'sleepTimerOsdCountdown';
        wrapper.style.cssText = [
            'display:none',
            'align-items:center',
            'margin-left:4px'
        ].join(';');

        var countdown = document.createElement('span');
        countdown.id = 'sleepTimerOsdCountdown';
        countdown.style.cssText = [
            'font-size:0.9rem',
            'color:#0084ff',
            'font-weight:600',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
            'min-width:42px',
            'text-align:center',
            'padding:0 6px',
            'cursor:default'
        ].join(';');

        var clearBtn = document.createElement('button');
        clearBtn.setAttribute('is', 'paper-icon-button-light');
        clearBtn.className = 'sleepTimerClearBtn autoSize';
        clearBtn.title = 'Clear sleep timer';
        clearBtn.style.cssText = 'opacity:0.7';
        clearBtn.innerHTML = '<span class="xlargePaperIconButton material-icons" aria-hidden="true" style="font-size:1.2em">close</span>';
        clearBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            cancelTimer();
            notify('Sleep timer cleared');
        });

        wrapper.appendChild(countdown);
        wrapper.appendChild(clearBtn);
        return wrapper;
    }

    function injectButton() {
        var osd = document.querySelector('.videoOsdBottom');
        if (!osd) return false;
        if (osd.querySelector('.btnSleepTimer')) return true;

        var sleepBtn = createSleepTimerButton();
        var osdCountdown = createOsdCountdown();

        var subtitleBtn = osd.querySelector('.btnSubtitles');
        if (subtitleBtn && subtitleBtn.parentNode) {
            subtitleBtn.parentNode.insertBefore(sleepBtn, subtitleBtn.nextSibling);
            subtitleBtn.parentNode.insertBefore(osdCountdown, sleepBtn.nextSibling);
        } else {
            var buttonsRow = osd.querySelector('.osdButtons');
            if (buttonsRow) {
                buttonsRow.appendChild(sleepBtn);
                buttonsRow.appendChild(osdCountdown);
            } else {
                return false;
            }
        }

        // If a timer is already running (from server sync), show the countdown immediately
        if (sleepTimerEnd) {
            updateOsdCountdown(Math.max(0, Math.ceil((sleepTimerEnd - Date.now()) / 1000)));
        }

        // Try server sync once the button is in the OSD
        syncFromServer();

        return true;
    }

    function updateOsdCountdown(remaining) {
        var el = document.getElementById('sleepTimerOsdCountdown');
        if (el) {
            el.textContent = remaining > 0 ? formatTime(remaining) : '';
        }
        var wrapper = document.querySelector('.sleepTimerOsdCountdown');
        if (wrapper) {
            wrapper.style.display = remaining > 0 ? 'flex' : 'none';
        }
    }

    // ------------------------------------------------------------------
    // Panel UI
    // ------------------------------------------------------------------

    function showSleepTimerPanel() {
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

        function cancelAutoClose() {
            if (autoCloseTimer) {
                clearTimeout(autoCloseTimer);
                autoCloseTimer = null;
            }
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
                '<div style="display:flex;gap:6px;align-items:center">',
                    '<input id="stCustomMinutes" type="number" min="1" max="600" placeholder="Custom" style="flex:1;padding:8px 10px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:6px;font-size:0.9rem;width:60px" />',
                    '<span style="color:#888;font-size:0.85rem">min</span>',
                    '<button id="stCustomStart" style="padding:8px 16px;background:#0084ff;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.9rem">Start</button>',
                '</div>',
            '</div>',

            '<div id="stActiveControls" style="display:' + (activeTimer > 0 ? 'block' : 'none') + ';margin-bottom:12px;padding-top:12px;border-top:1px solid #333">',
                '<div style="display:flex">',
                    '<button id="stAdd15" style="flex:1;padding:8px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:6px;cursor:pointer;margin-right:8px">+15m</button>',
                    '<button id="stAdd30" style="flex:1;padding:8px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:6px;cursor:pointer;margin-right:8px">+30m</button>',
                    '<button id="stCancel" style="flex:1;padding:8px;background:#d32f2f;color:#fff;border:none;border-radius:6px;cursor:pointer">Cancel</button>',
                '</div>',
            '</div>'
        ].join('');

        document.body.appendChild(panel);

        panel.addEventListener('click', startAutoClose);
        panel.addEventListener('mousemove', startAutoClose);
        startAutoClose();

        // Preset duration buttons — call server API to start
        var presetBtns = panel.querySelectorAll('.stPreset');
        for (var i = 0; i < presetBtns.length; i++) {
            presetBtns[i].addEventListener('click', function(e) {
                e.stopPropagation();
                cancelAutoClose();
                if (autoCloseTimer) clearTimeout(autoCloseTimer);
                startDurationTimer(parseInt(this.dataset.mins, 10));
                panel.remove();
            });
        }

        // Custom duration input — call server API to start
        var customInput = document.getElementById('stCustomMinutes');
        var customStartBtn = document.getElementById('stCustomStart');
        if (customStartBtn) {
            customStartBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                cancelAutoClose();
                var mins = parseInt(customInput.value, 10);
                if (isNaN(mins) || mins <= 0 || mins > 600) {
                    notify('Enter a duration between 1 and 600 minutes');
                    return;
                }
                startDurationTimer(mins);
                panel.remove();
            });
            // Enter key in the input also starts the timer
            customInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.stopPropagation();
                    e.preventDefault();
                    customStartBtn.click();
                }
            });
        }

        // Active timer controls — call server API to extend/cancel
        if (activeTimer > 0) {
            document.getElementById('stAdd15').addEventListener('click', function(e) {
                e.stopPropagation();
                cancelAutoClose();
                extendTimer(15);
                startAutoClose();
            });
            document.getElementById('stAdd30').addEventListener('click', function(e) {
                e.stopPropagation();
                cancelAutoClose();
                extendTimer(30);
                startAutoClose();
            });
            document.getElementById('stCancel').addEventListener('click', function(e) {
                e.stopPropagation();
                cancelAutoClose();
                cancelTimer();
                panel.remove();
            });
        }
    }

    // ------------------------------------------------------------------
    // Timer logic (server is source of truth)
    // ------------------------------------------------------------------

    function pad2(n) {
        n = String(n);
        return n.length < 2 ? '0' + n : n;
    }

    function formatTime(seconds) {
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = seconds % 60;
        if (h > 0) return h + ':' + pad2(m) + ':' + pad2(s);
        return m + ':' + pad2(s);
    }

    // Start a timer: tells the server, then starts the local countdown
    function startDurationTimer(minutes) {
        var userId = getCurrentUserId();
        if (!userId) {
            console.error('[SleepTimer] No user ID available');
            return;
        }

        apiPost('/SleepTimer/Start', {
            UserId: userId,
            DurationMinutes: minutes
        }).then(function(data) {
            sleepTimerEnd = Date.now() + minutes * 60 * 1000;
            currentSessionId = data.sessionId || currentSessionId;
            popupShown = false;
            startCountdown();
            notify('Sleep timer started: ' + minutes + ' minutes');
        }).catch(function(e) {
            console.error('[SleepTimer] Failed to start timer:', e);
            notify('Failed to start sleep timer');
        });
    }

    // Extend the timer: tells the server, then updates local countdown
    function extendTimer(additionalMinutes) {
        var userId = getCurrentUserId();
        if (!userId || !currentSessionId) {
            console.error('[SleepTimer] No session ID for extend');
            return;
        }

        apiPost('/SleepTimer/Extend', {
            UserId: userId,
            SessionId: currentSessionId,
            AdditionalMinutes: additionalMinutes
        }).then(function() {
            sleepTimerEnd += additionalMinutes * 60 * 1000;
            updateCountdown();
            notify('Sleep timer extended by ' + additionalMinutes + ' minutes');
        }).catch(function(e) {
            console.error('[SleepTimer] Failed to extend timer:', e);
            notify('Failed to extend sleep timer');
        });
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
            }
        }, 1000);
    }

    function updateCountdown() {
        if (!sleepTimerEnd) return;
        var remaining = Math.max(0, Math.ceil((sleepTimerEnd - Date.now()) / 1000));
        var panelCountdown = document.getElementById('sleepTimerCountdown');
        if (panelCountdown) panelCountdown.textContent = formatTime(remaining);
        updateOsdCountdown(remaining);
    }

    // Cancel the timer: tells the server, then clears local state
    function cancelTimer() {
        if (currentSessionId) {
            apiDelete('/SleepTimer/Cancel/' + currentSessionId).catch(function(e) {
                console.error('[SleepTimer] Failed to cancel timer on server:', e);
            });
        }

        if (sleepTimerInterval) {
            clearInterval(sleepTimerInterval);
            sleepTimerInterval = null;
        }
        sleepTimerEnd = null;
        popupShown = false;
        updateOsdCountdown(0);
        var countdown = document.getElementById('sleepTimerCountdown');
        if (countdown) countdown.textContent = '';
        var activeControls = document.getElementById('stActiveControls');
        if (activeControls) activeControls.style.display = 'none';

        var popup = document.getElementById('sleepTimerPopup');
        if (popup) popup.remove();
    }

    // ------------------------------------------------------------------
    // "Are you still watching?" popup
    // ------------------------------------------------------------------

    function showStillWatchingPopup(initialSeconds) {
        var existing = document.getElementById('sleepTimerPopup');
        if (existing) existing.remove();

        var popupSeconds = initialSeconds || Math.floor(popupTimeoutMs / 1000);

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
            '<div style="font-size:0.9rem;color:#888;margin-bottom:24px">Playback will stop in <span id="popupCountdown">' + popupSeconds + '</span> seconds.</div>',
            '<button id="popupContinue" style="padding:12px 32px;background:#0084ff;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem;font-weight:500">Continue Watching</button>',
            '<button id="popupStop" style="margin-left:12px;padding:12px 24px;background:transparent;color:#888;border:1px solid #333;border-radius:8px;cursor:pointer;font-size:0.9rem">Stop Now</button>'
        ].join('');

        // Set the bedtime icon properly
        var iconSpan = popup.querySelector('div[style*="font-size:2.5rem"]');
        if (iconSpan) {
            iconSpan.innerHTML = '<span class="material-icons" style="font-size:2.5rem">bedtime</span>';
        }

        document.body.appendChild(popup);

        // Countdown for the popup
        var popupInterval = setInterval(function() {
            popupSeconds--;
            var el = document.getElementById('popupCountdown');
            if (el) el.textContent = popupSeconds;
            if (popupSeconds <= 0) {
                clearInterval(popupInterval);
                var p = document.getElementById('sleepTimerPopup');
                if (p) p.remove();
                // Timeout — tell the server to stop (server fallback will also fire)
                sendPopupResponse('stop');
                stopPlayback();
                clearLocalTimerState();
            }
        }, 1000);

        // Continue button: tell server "continue", clear local state
        document.getElementById('popupContinue').addEventListener('click', function() {
            clearInterval(popupInterval);
            var p = document.getElementById('sleepTimerPopup');
            if (p) p.remove();
            sendPopupResponse('continue');
            clearLocalTimerState();
            notify('Sleep timer cancelled — enjoy your show!');
        });

        // Stop button: tell server "stop", stop playback
        document.getElementById('popupStop').addEventListener('click', function() {
            clearInterval(popupInterval);
            var p = document.getElementById('sleepTimerPopup');
            if (p) p.remove();
            sendPopupResponse('stop');
            stopPlayback();
            clearLocalTimerState();
        });

        // Escape: dismiss popup without stopping (accidental press protection)
        // Tell server "continue" so it doesn't hard-stop
        document.addEventListener('keydown', function onEsc(e) {
            if (e.key === 'Escape') {
                clearInterval(popupInterval);
                var p = document.getElementById('sleepTimerPopup');
                if (p) p.remove();
                sendPopupResponse('continue');
                clearLocalTimerState();
                notify('Sleep timer dismissed');
                document.removeEventListener('keydown', onEsc);
            }
        });
    }

    // Send popup response to the server
    function sendPopupResponse(action) {
        var userId = getCurrentUserId();
        if (!userId) return;

        apiPost('/SleepTimer/PopupResponse', {
            UserId: userId,
            SessionId: currentSessionId || '',
            Action: action
        }).catch(function(e) {
            console.error('[SleepTimer] Failed to send popup response:', e);
        });
    }

    // Clear local timer state without contacting the server
    function clearLocalTimerState() {
        if (sleepTimerInterval) {
            clearInterval(sleepTimerInterval);
            sleepTimerInterval = null;
        }
        sleepTimerEnd = null;
        popupShown = false;
        updateOsdCountdown(0);
        var countdown = document.getElementById('sleepTimerCountdown');
        if (countdown) countdown.textContent = '';
        var activeControls = document.getElementById('stActiveControls');
        if (activeControls) activeControls.style.display = 'none';
    }

    // ------------------------------------------------------------------
    // Stop playback (client-side fallback only)
    // The server is the primary stopper via SendPlaystateCommand.
    // This is only used when the client needs to stop immediately
    // (popup timeout) and the server PopupResponse call may not have
    // propagated yet.
    // ------------------------------------------------------------------

    function stopPlayback() {
        var apiClient = window.ApiClient;
        if (!apiClient) {
            console.error('[SleepTimer] No ApiClient for stop fallback');
            return;
        }

        var token = apiClient.accessToken();
        var userId = apiClient.getCurrentUserId();
        var sessionsUrl = apiClient.getUrl('Sessions');

        fetch(sessionsUrl, {
            headers: { 'X-Emby-Token': token }
        })
        .then(function(r) { return r.json(); })
        .then(function(sessions) {
            for (var i = 0; i < sessions.length; i++) {
                if (sessions[i].UserId === userId && sessions[i].NowPlayingItem != null) {
                    var stopUrl = apiClient.getUrl('Sessions/' + sessions[i].Id + '/Playing/Stop');
                    fetch(stopUrl, {
                        method: 'POST',
                        headers: { 'X-Emby-Token': token }
                    }).catch(function(e) { console.error('[SleepTimer] Stop fallback failed:', e); });
                    return;
                }
            }
        })
        .catch(function(e) { console.error('[SleepTimer] Stop fallback session lookup failed:', e); });
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
            injectInterval = null;
            if (observer) { observer.disconnect(); observer = null; }
        }
    }, 1000);

    var observer = new MutationObserver(function() {
        if (document.querySelector('.videoOsdBottom') && !document.querySelector('.btnSleepTimer')) {
            if (injectButton()) {
                if (injectInterval) { clearInterval(injectInterval); injectInterval = null; }
                observer.disconnect();
                observer = null;
            }
        }
    });
    // Only observe direct childList changes on body — subtree:true fires on
    // every DOM mutation in the entire page which is wasteful.
    observer.observe(document.body, { childList: true });
    window.__sleepTimerObserver = observer;

    // Also try syncing on script load (covers cases where the OSD is already present)
    syncFromServer();

    // ------------------------------------------------------------------
    // Cleanup function (used by reinstall/uninstall)
    // ------------------------------------------------------------------

    window.__sleepTimerCleanup = function() {
        if (sleepTimerInterval) clearInterval(sleepTimerInterval);
        sleepTimerInterval = null;
        sleepTimerEnd = null;
        popupShown = false;
        currentSessionId = null;
        syncedFromServer = false;

        if (injectInterval) {
            clearInterval(injectInterval);
            injectInterval = null;
        }

        if (window.__sleepTimerObserver) {
            window.__sleepTimerObserver.disconnect();
            window.__sleepTimerObserver = null;
        }

        var oldBtn = document.querySelector('.btnSleepTimer');
        if (oldBtn) oldBtn.remove();

        var oldCountdown = document.querySelector('.sleepTimerOsdCountdown');
        if (oldCountdown) oldCountdown.remove();

        var oldPanel = document.getElementById('sleepTimerPanel');
        if (oldPanel) oldPanel.remove();

        var oldPopup = document.getElementById('sleepTimerPopup');
        if (oldPopup) oldPopup.remove();

        console.log('[SleepTimer] Cleaned up previous instance');
    };

    console.log('[SleepTimer] Injected. Looking for player OSD...');
})();