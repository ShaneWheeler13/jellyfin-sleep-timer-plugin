// Jellyfin Sleep Timer — Client-side injection script
//
// Adds a sleep timer button to the video player OSD and a settings panel.
// When the countdown reaches zero, shows an "Are you still watching?" dialog.
// The server is the source of truth — every action (start, extend, cancel,
// popup response) goes through the API. On load, the client syncs from the
// server so a page refresh doesn't lose the timer.
//
// This script is loaded by sleeptimer-autoloader.js (via middleware injection)
// or manually from the config page's Install button.
//
// Jellyfin 12.x compatibility: uses multiple selector strategies to find
// the OSD button container, falling back gracefully if class names change.

(function() {
    'use strict';

    // Clean up any previous instance (re-injection safety)
    if (window.__sleepTimerCleanup) { window.__sleepTimerCleanup(); }

    var sleepTimerInterval = null;       // setInterval handle for the local countdown
    var sleepTimerEnd = null;             // epoch ms, synced from server EndTime
    var currentSessionId = null;          // session ID from server
    var popupShown = false;               // true while the popup is visible
    var popupTimeoutMs = 60000;           // fallback grace period if server value unavailable
    var syncedFromServer = false;         // guard so syncFromServer runs once
    var mutationObserver = null;          // MutationObserver for OSD detection
    var fadeInterval = null;              // backstop interval handle for the volume fade
    var fadeStartMs = null;               // wall-clock start of the fade (epoch ms)
    var fadeTotalMs = null;               // total fade length (ms)
    var fadeStartVolume = null;           // volume the fade begins from
    var originalVolume = null;            // volume captured when the fade begins
    var fadeRestored = false;             // guard so we only restore volume once
    var fadeMedia = null;                 // media element the fade is bound to
    var fadeTimeUpdateHandler = null;     // timeupdate listener (cleared on restore)
    var fadeVerifyLogged = false;         // one-shot log if volume gets reverted

    // ------------------------------------------------------------------
    // API helpers — thin wrappers around fetch with auth headers
    // ------------------------------------------------------------------

    // Resolves the Jellyfin server address from ApiClient or location fallback
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

    // Extracts the auth token from ApiClient
    function getAuthToken() {
        var api = window.ApiClient;
        if (!api && window.Connections && window.Connections.currentApiClient) {
            api = window.Connections.currentApiClient();
        }
        if (api && api.accessToken) return api.accessToken();
        return '';
    }

    // Builds headers with the Emby auth token for API requests
    function authHeaders() {
        return {
            'X-Emby-Token': getAuthToken(),
            'Content-Type': 'application/json'
        };
    }

    // Gets the current Jellyfin user ID from ApiClient
    function getCurrentUserId() {
        var api = window.ApiClient;
        if (!api && window.Connections && window.Connections.currentApiClient) {
            api = window.Connections.currentApiClient();
        }
        if (api && api.getCurrentUserId) return api.getCurrentUserId();
        return null;
    }

    // POST JSON to the Sleep Timer API, returns parsed response
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

    // DELETE to the Sleep Timer API, returns parsed response
    function apiDelete(path) {
        return fetch(getApiBase() + path, {
            method: 'DELETE',
            headers: authHeaders()
        }).then(function(r) {
            if (!r.ok) throw new Error(path + ' returned ' + r.status);
            return r.json();
        });
    }

    // GET from the Sleep Timer API, returns parsed response
    function apiGet(path) {
        return fetch(getApiBase() + path, {
            headers: authHeaders()
        }).then(function(r) {
            if (!r.ok) throw new Error(path + ' returned ' + r.status);
            return r.json();
        });
    }

    // ------------------------------------------------------------------
    // Server sync — resume countdown after page refresh
    // ------------------------------------------------------------------

    // Sync with the server on load. If a timer is already running (e.g. after
    // page refresh), resume the countdown from the server's EndTime. If the
    // timer already expired and the popup is pending, show it immediately.
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
    // Button creation and OSD injection
    // ------------------------------------------------------------------

    // Creates the bedtime icon button shown in the player OSD
    function createSleepTimerButton() {
        var btn = document.createElement('button');
        // Keep paper-icon-button-light for 10.x compatibility, but also add
        // a plain class for 12.x which may not use the custom element
        btn.setAttribute('is', 'paper-icon-button-light');
        btn.className = 'btnSleepTimer autoSize';
        btn.title = 'Sleep Timer';
        btn.innerHTML = '<span class="xlargePaperIconButton material-icons" aria-hidden="true" style="font-size:1.8em">bedtime</span>';
        btn.addEventListener('click', showSleepTimerPanel);
        return btn;
    }

    // Creates the countdown display that sits next to the button in the OSD
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

    // Finds the OSD button container using multiple selector strategies.
    // Returns the parent element where the sleep timer button should be
    // inserted, or null if the OSD isn't present yet.
    //
    // Strategy 1: Find the subtitle button and insert next to it (10.x)
    // Strategy 2: Find an .osdButtons container (10.x fallback)
    // Strategy 3: Find any container with .btnSubtitles or [data-action="subtitles"] (12.x)
    // Strategy 4: Find the OSD bottom bar by class or role and append
    function findOsdInsertionPoint() {
        // Strategy 1: Subtitle button (10.x class name)
        var subtitleBtn = document.querySelector('.btnSubtitles');
        if (subtitleBtn && subtitleBtn.parentNode) {
            return { parent: subtitleBtn.parentNode, anchor: subtitleBtn, mode: 'after' };
        }

        // Strategy 3: Subtitle button (12.x — may use different class or data attribute)
        subtitleBtn = document.querySelector('[data-action="subtitles"]') ||
                      document.querySelector('button[title*="Subtitle"]') ||
                      document.querySelector('button[title*="subtitle"]');
        if (subtitleBtn && subtitleBtn.parentNode) {
            return { parent: subtitleBtn.parentNode, anchor: subtitleBtn, mode: 'after' };
        }

        // Strategy 2: osdButtons container (10.x)
        var buttonsRow = document.querySelector('.osdButtons');
        if (buttonsRow) {
            return { parent: buttonsRow, anchor: null, mode: 'append' };
        }

        // Strategy 4: OSD bottom bar — try multiple selectors
        var osdBottom = document.querySelector('.videoOsdBottom') ||
                        document.querySelector('[class*="osdBottom"]') ||
                        document.querySelector('[class*="osd-bottom"]') ||
                        document.querySelector('.videoPlayer')?.querySelector('[class*="buttons"]');
        if (osdBottom) {
            // Try to find a button row inside it
            var innerButtons = osdBottom.querySelector('.osdButtons') ||
                               osdBottom.querySelector('[class*="buttons"]') ||
                               osdBottom.querySelector('[class*="controls"]');
            if (innerButtons) {
                return { parent: innerButtons, anchor: null, mode: 'append' };
            }
            // Just append to the OSD bottom itself
            return { parent: osdBottom, anchor: null, mode: 'append' };
        }

        return null;
    }

    // Injects the button and countdown into the OSD. Returns true on success,
    // false if the OSD isn't present yet (caller polls).
    function injectButton() {
        // Check if button is already present
        if (document.querySelector('.btnSleepTimer')) return true;

        var insertion = findOsdInsertionPoint();
        if (!insertion) return false;

        var sleepBtn = createSleepTimerButton();
        var osdCountdown = createOsdCountdown();

        if (insertion.mode === 'after' && insertion.anchor) {
            insertion.parent.insertBefore(sleepBtn, insertion.anchor.nextSibling);
            insertion.parent.insertBefore(osdCountdown, sleepBtn.nextSibling);
        } else {
            insertion.parent.appendChild(sleepBtn);
            insertion.parent.appendChild(osdCountdown);
        }

        // If a timer is already running (from server sync), show the countdown immediately
        if (sleepTimerEnd) {
            updateOsdCountdown(Math.max(0, Math.ceil((sleepTimerEnd - Date.now()) / 1000)));
        }

        // Try server sync once the button is in the OSD.
        // Reset the guard so each OSD rebuild (e.g. switching shows) re-syncs
        // from the server, picking up any timer that survived the navigation.
        syncedFromServer = false;
        syncFromServer();

        return true;
    }

    // Updates the OSD countdown text. Pass 0 to hide it.
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
    // Panel UI — the popup settings panel with preset durations
    // ------------------------------------------------------------------

    // Shows the settings panel. If already open, closes it. Auto-closes after
    // 4 seconds of inactivity. Offers preset durations and, if a timer is
    // active, extend/cancel controls.
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
                '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">',
                    '<button class="stPreset" data-mins="15" style="padding:10px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:6px;cursor:pointer;font-size:0.95rem">15m</button>',
                    '<button class="stPreset" data-mins="30" style="padding:10px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:6px;cursor:pointer;font-size:0.95rem">30m</button>',
                    '<button class="stPreset" data-mins="45" style="padding:10px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:6px;cursor:pointer;font-size:0.95rem">45m</button>',
                    '<button class="stPreset" data-mins="60" style="padding:10px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:6px;cursor:pointer;font-size:0.95rem">1h</button>',
                    '<button class="stPreset" data-mins="90" style="padding:10px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:6px;cursor:pointer;font-size:0.95rem">1.5h</button>',
                    '<button class="stPreset" data-mins="120" style="padding:10px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:6px;cursor:pointer;font-size:0.95rem">2h</button>',
                '</div>',
            '</div>',

            '<div id="stActiveControls" style="display:' + (activeTimer > 0 ? 'block' : 'none') + ';margin-bottom:12px;padding-top:12px;border-top:1px solid #333">',
                '<div style="display:flex">',
                    '<button id="stAdd5" style="flex:1;padding:8px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:6px;cursor:pointer;margin-right:8px">+5m</button>',
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

        // Active timer controls — call server API to extend/cancel
        if (activeTimer > 0) {
            document.getElementById('stAdd5').addEventListener('click', function(e) {
                e.stopPropagation();
                cancelAutoClose();
                extendTimer(5);
                startAutoClose();
            });
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
    // Timer logic — server is source of truth, client mirrors locally
    // ------------------------------------------------------------------

    // Zero-pad a number to 2 digits
    function pad2(n) {
        n = String(n);
        return n.length < 2 ? '0' + n : n;
    }

    // Formats seconds as H:MM:SS or M:SS
    function formatTime(seconds) {
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = seconds % 60;
        if (h > 0) return h + ':' + pad2(m) + ':' + pad2(s);
        return m + ':' + pad2(s);
    }

    // Starts a timer: calls the server API, then begins the local countdown
    function startDurationTimer(minutes) {
        var userId = getCurrentUserId();
        if (!userId) {
            console.error('[SleepTimer] No user ID available');
            return;
        }

        apiPost('/SleepTimer/Start', {
            UserId: userId,
            DurationMinutes: minutes
        })
        .then(function(data) {
            if (data && data.sessionId) currentSessionId = data.sessionId;
            sleepTimerEnd = data && data.endTime
                ? new Date(data.endTime).getTime()
                : Date.now() + minutes * 60 * 1000;
            popupShown = false;
            startCountdown();
            updateOsdCountdown(minutes * 60);
            notify('Sleep timer set for ' + formatTime(minutes * 60));
        })
        .catch(function(e) {
            console.error('[SleepTimer] Start failed:', e);
            notify('Failed to start sleep timer');
        });
    }

    // Extends the running timer by N minutes via the server API
    function extendTimer(minutes) {
        var userId = getCurrentUserId();
        if (!userId || !currentSessionId) {
            // Fallback: try without session ID, server will look up by user
            if (!userId) {
                console.error('[SleepTimer] No user ID for extend');
                return;
            }
        }

        apiPost('/SleepTimer/Extend', {
            UserId: userId,
            SessionId: currentSessionId || undefined,
            AdditionalMinutes: minutes
        })
        .then(function() {
            if (sleepTimerEnd) sleepTimerEnd += minutes * 60 * 1000;
            notify('Sleep timer extended by ' + minutes + 'm');
        })
        .catch(function(e) {
            console.error('[SleepTimer] Extend failed:', e);
            notify('Failed to extend sleep timer');
        });
    }

    // Cancels the running timer via the server API
    function cancelTimer() {
        if (!currentSessionId) {
            console.warn('[SleepTimer] No session ID for cancel');
            return;
        }

        apiDelete('/SleepTimer/Cancel/' + currentSessionId)
        .then(function() {
            sleepTimerEnd = null;
            popupShown = false;
            if (sleepTimerInterval) {
                clearInterval(sleepTimerInterval);
                sleepTimerInterval = null;
            }
            updateOsdCountdown(0);
            currentSessionId = null;
        })
        .catch(function(e) {
            console.error('[SleepTimer] Cancel failed:', e);
        });
    }

    // Starts the local countdown interval — updates the OSD every second
    function startCountdown() {
        if (sleepTimerInterval) clearInterval(sleepTimerInterval);
        sleepTimerInterval = setInterval(function() {
            if (!sleepTimerEnd) {
                clearInterval(sleepTimerInterval);
                sleepTimerInterval = null;
                updateOsdCountdown(0);
                return;
            }

            var remaining = Math.max(0, Math.ceil((sleepTimerEnd - Date.now()) / 1000));

            // Update OSD countdown
            updateOsdCountdown(remaining);

            // Update panel countdown if the panel is open
            var panelCountdown = document.getElementById('sleepTimerCountdown');
            if (panelCountdown) {
                panelCountdown.textContent = formatTime(remaining);
            }

            // Timer has reached zero — show the popup (if not already shown)
            if (remaining <= 0 && !popupShown) {
                popupShown = true;
                clearInterval(sleepTimerInterval);
                sleepTimerInterval = null;
                // Duration comes from the server so the popup and the volume
                // fade always use the configured grace period.
                promptExpiry();
            }
        }, 1000);
    }

    // Asks the server how long the grace period is, then shows the popup.
    // Falls back to popupTimeoutMs when the server cannot be reached.
    function promptExpiry() {
        var userId = getCurrentUserId();
        if (!userId) {
            showStillWatchingPopup(Math.round(popupTimeoutMs / 1000), null);
            return;
        }

        apiGet('/SleepTimer/TimerByUser/' + userId)
            .then(function(data) {
                if (data && data.State === 'PopupPending' && data.PopupRemainingSeconds > 0) {
                    currentSessionId = data.SessionId || currentSessionId;
                    showStillWatchingPopup(data.PopupRemainingSeconds, data.FadeDurationSeconds);
                } else if (data && data.State === 'PopupPending') {
                    // Grace already nearly over — nothing to show
                    return;
                } else {
                    // Server has no timer (cancelled elsewhere) — do nothing
                    return;
                }
            })
            .catch(function(e) {
                console.error('[SleepTimer] Could not read grace period, using fallback:', e);
                showStillWatchingPopup(Math.round(popupTimeoutMs / 1000), null);
            });
    }

    // ------------------------------------------------------------------
    // "Are you still watching?" popup
    // ------------------------------------------------------------------

    // Shows the "Are you still watching?" dialog with a countdown.
    // The user can continue watching or stop now. If they don't respond
    // within the timeout, the server will hard-stop playback as a fallback.
    function showStillWatchingPopup(secondsRemaining, fadeSeconds) {
        var existing = document.getElementById('sleepTimerPopup');
        if (existing) existing.remove();

        var remaining = secondsRemaining || 60;
        var popupInterval = null;

        var popup = document.createElement('div');
        popup.id = 'sleepTimerPopup';
        popup.style.cssText = [
            'position:fixed',
            'top:50%',
            'left:50%',
            'transform:translate(-50%,-50%)',
            'background:rgba(16,16,16,0.98)',
            'border:1px solid #333',
            'border-radius:12px',
            'padding:32px',
            'z-index:10000',
            'color:#ddd',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
            'text-align:center',
            'min-width:340px',
            'box-shadow:0 8px 40px rgba(0,0,0,0.7)'
        ].join(';');

        popup.innerHTML = [
            '<div style="font-size:2rem;margin-bottom:8px">🌙</div>',
            '<div style="font-size:1.4rem;font-weight:600;margin-bottom:8px;color:#fff">Are you still watching?</div>',
            '<div style="font-size:0.95rem;color:#888;margin-bottom:20px">Your sleep timer has ended.</div>',
            '<div id="stPopupCountdown" style="font-size:1.8rem;font-weight:700;color:#0084ff;margin-bottom:24px">' + remaining + '</div>',
            '<div style="display:flex;gap:12px;justify-content:center">',
                '<button id="stContinueBtn" style="padding:10px 24px;background:#2a2a2a;color:#ddd;border:1px solid #444;border-radius:8px;cursor:pointer;font-size:1rem">Continue Watching</button>',
                '<button id="stStopBtn" style="padding:10px 24px;background:#d32f2f;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem">Stop Now</button>',
            '</div>'
        ].join('');

        document.body.appendChild(popup);

        // Begin the volume fade (if the server says one is active).
        // The fade runs in parallel with the countdown so audio is already
        // gone by the time playback stops.
        if (fadeSeconds && fadeSeconds > 0) {
            startVolumeFade(fadeSeconds);
        }

        function closePopup() {
            if (popupInterval) clearInterval(popupInterval);
            var p = document.getElementById('sleepTimerPopup');
            if (p) p.remove();
        }

        function reportResponse(action) {
            var userId = getCurrentUserId();
            if (!userId) return;
            apiPost('/SleepTimer/PopupResponse', {
                UserId: userId,
                SessionId: currentSessionId || undefined,
                Action: action
            }).catch(function(e) {
                console.error('[SleepTimer] Popup response failed:', e);
            });
        }

        document.getElementById('stContinueBtn').addEventListener('click', function() {
            reportResponse('continue');
            restoreVolume();
            sleepTimerEnd = null;
            popupShown = false;
            currentSessionId = null;
            updateOsdCountdown(0);
            closePopup();
        });

        document.getElementById('stStopBtn').addEventListener('click', function() {
            // Restore first so the next session is not left muted.
            restoreVolume();
            reportResponse('stop');
            sleepTimerEnd = null;
            popupShown = false;
            currentSessionId = null;
            updateOsdCountdown(0);
            closePopup();
        });

        // Escape key dismisses without stopping (accidental press protection)
        popup.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                reportResponse('continue');
                restoreVolume();
                sleepTimerEnd = null;
                popupShown = false;
                currentSessionId = null;
                updateOsdCountdown(0);
                closePopup();
            }
        });
        popup.tabIndex = -1;
        popup.focus();

        // Countdown timer for the popup
        popupInterval = setInterval(function() {
            remaining--;
            var cdEl = document.getElementById('stPopupCountdown');
            if (cdEl) cdEl.textContent = remaining;
            if (remaining <= 0) {
                // Timer ran out. Restore volume before the server hard-stops
                // so the next session is not left muted.
                restoreVolume();
                closePopup();
                // Server will hard-stop as fallback — no need to send another
                // response; the server's monitor loop handles this.
            }
        }, 1000);
    }

    // ------------------------------------------------------------------
    // Volume fade
    // ------------------------------------------------------------------

    // Resolves the active media element. Jellyfin's web player renders a
    // <video> or <audio> tag; we search the top window to cover the player
    // living outside the config page iframe.
    function getMediaElement() {
        var target = window;
        try { target = window.top; } catch (e) { target = window; }
        if (!target || !target.document) return null;
        return target.document.querySelector('video.htmlvideoplayer') ||
               target.document.querySelector('video') ||
               target.document.querySelector('audio');
    }

    // Fades the media element's volume from its current level to 0 over
    // durationSeconds.
    //
    // The ramp is driven two ways so it survives background-tab throttling:
    //   1. timeupdate — fires from the media pipeline (~4x/sec while audio
    //      plays) and is not subject to the JS timer throttle that setInterval
    //      hits in a background tab. This is the primary driver.
    //   2. A 1s setInterval backstop, in case timeupdate stalls.
    //
    // Both paths compute volume from elapsed wall-clock time rather than a
    // tick counter, so a throttled tab jumps straight to the correct level
    // instead of falling behind. Both paths are idempotent, so double-firing
    // is harmless.
    //
    // No-op if no media element is found, which degrades gracefully to the
    // previous abrupt-stop behavior.
    function startVolumeFade(durationSeconds) {
        var media = getMediaElement();
        if (!media) {
            console.warn('[SleepTimer] Volume fade skipped — no media element found');
            return;
        }

        // Snapshot the user's volume so we can put it back afterwards.
        if (originalVolume === null) {
            originalVolume = typeof media.volume === 'number' ? media.volume : 1;
            fadeRestored = false;
        }

        // Reset any in-flight fade before starting a new one.
        stopFadeEngine();

        fadeMedia = media;
        fadeStartMs = Date.now();
        fadeTotalMs = Math.max(1, durationSeconds * 1000);
        fadeStartVolume = originalVolume;

        // Primary driver: media-pipeline driven, immune to timer throttling.
        fadeTimeUpdateHandler = function() { applyFadeStep(); };
        try {
            media.addEventListener('timeupdate', fadeTimeUpdateHandler);
        } catch (e) {
            console.warn('[SleepTimer] Could not attach timeupdate listener:', e);
        }

        // Backstop driver: covers the case where timeupdate stalls.
        fadeInterval = setInterval(applyFadeStep, 1000);

        // Apply the first step immediately so the ramp starts without a delay.
        applyFadeStep();
    }

    // Applies one fade step computed from elapsed wall-clock time.
    // Safe to call any number of times; finishes and detaches at the end.
    function applyFadeStep() {
        if (fadeStartMs === null || !fadeMedia) return;

        var elapsed = Date.now() - fadeStartMs;
        var progress = elapsed / fadeTotalMs;
        if (progress > 1) progress = 1;

        var nextVolume = fadeStartVolume * (1 - progress);
        if (nextVolume < 0) nextVolume = 0;

        try {
            fadeMedia.volume = nextVolume;
        } catch (e) {
            console.error('[SleepTimer] Volume fade error:', e);
            stopFadeEngine();
            return;
        }

        // Detect the player silently reverting our value. Log once so it shows
        // up in the console without spamming every tick.
        if (!fadeVerifyLogged && progress > 0.1 && progress < 0.9) {
            var actual = fadeMedia.volume;
            if (Math.abs(actual - nextVolume) > 0.05) {
                fadeVerifyLogged = true;
                console.warn('[SleepTimer] Player is overriding fade volume (wanted ' +
                    nextVolume.toFixed(2) + ', got ' + actual.toFixed(2) + ')');
            }
        }

        if (progress >= 1) {
            stopFadeEngine();
        }
    }

    // Detaches the fade drivers without changing volume.
    function stopFadeEngine() {
        if (fadeInterval) {
            clearInterval(fadeInterval);
            fadeInterval = null;
        }

        if (fadeTimeUpdateHandler && fadeMedia) {
            try {
                fadeMedia.removeEventListener('timeupdate', fadeTimeUpdateHandler);
            } catch (e) { /* element may be gone */ }
        }

        fadeTimeUpdateHandler = null;
        fadeMedia = null;
        fadeStartMs = null;
        fadeTotalMs = null;
        fadeStartVolume = null;
    }

    // Restores the volume captured when the fade started. Safe to call
    // multiple times — only the first call does any work.
    function restoreVolume() {
        stopFadeEngine();

        if (originalVolume === null || fadeRestored) return;

        var media = getMediaElement();
        if (media) {
            try {
                media.volume = originalVolume;
            } catch (e) {
                console.error('[SleepTimer] Volume restore error:', e);
            }
        }

        fadeRestored = true;
        originalVolume = null;
        fadeVerifyLogged = false;
    }

    // ------------------------------------------------------------------
    // Notification helper — shows a brief toast at the bottom of the screen
    // ------------------------------------------------------------------

    function notify(msg) {
        // Try Jellyfin's built-in toast system first
        if (window.require) {
            try {
                var toast = window.require('toast');
                if (toast) { toast(msg); return; }
            } catch (e) { /* fall through */ }
        }
        // Fallback: simple toast
        var t = document.createElement('div');
        t.style.cssText = [
            'position:fixed',
            'bottom:80px',
            'left:50%',
            'transform:translateX(-50%)',
            'background:rgba(0,0,0,0.85)',
            'color:#fff',
            'padding:10px 20px',
            'border-radius:6px',
            'z-index:10001',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
            'font-size:0.9rem',
            'transition:opacity 0.3s'
        ].join(';');
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(function() {
            t.style.opacity = '0';
            setTimeout(function() { t.remove(); }, 300);
        }, 2500);
    }

    // ------------------------------------------------------------------
    // OSD detection — MutationObserver watches for the player to appear
    // ------------------------------------------------------------------

    function startOsdWatcher() {
        // Try immediately — OSD might already be present
        if (injectButton()) return;

        // Otherwise, watch for DOM changes that indicate the player loaded
        if (mutationObserver) mutationObserver.disconnect();

        mutationObserver = new MutationObserver(function(mutations) {
            // Check if the OSD appeared or was rebuilt
            for (var i = 0; i < mutations.length; i++) {
                if (mutations[i].addedNodes.length > 0) {
                    if (injectButton()) {
                        // Button injected — keep watching for OSD rebuilds (show switches)
                        // Don't disconnect; the observer handles re-injection
                        return;
                    }
                }
            }
        });

        // Watch the entire body subtree for added nodes (player is deep in the DOM)
        mutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // ------------------------------------------------------------------
    // Cleanup — called on re-injection or page unload
    // ------------------------------------------------------------------

    window.__sleepTimerCleanup = function() {
        // Put the volume back before tearing anything down, otherwise a
        // mid-fade cleanup would leave the player muted.
        try { restoreVolume(); } catch (e) { /* best effort */ }

        if (sleepTimerInterval) {
            clearInterval(sleepTimerInterval);
            sleepTimerInterval = null;
        }
        if (mutationObserver) {
            mutationObserver.disconnect();
            mutationObserver = null;
        }
        if (pageHideHandler) {
            try { window.removeEventListener('pagehide', pageHideHandler); } catch (e) { /* noop */ }
            pageHideHandler = null;
        }
        if (visibilityHandler) {
            try { document.removeEventListener('visibilitychange', visibilityHandler); } catch (e) { /* noop */ }
            visibilityHandler = null;
        }
        var btn = document.querySelector('.btnSleepTimer');
        if (btn) btn.remove();
        var countdown = document.querySelector('.sleepTimerOsdCountdown');
        if (countdown) countdown.remove();
        var panel = document.getElementById('sleepTimerPanel');
        if (panel) panel.remove();
        var popup = document.getElementById('sleepTimerPopup');
        if (popup) popup.remove();
        sleepTimerEnd = null;
        currentSessionId = null;
        popupShown = false;
        syncedFromServer = false;
    };

    // ------------------------------------------------------------------
    // Volume restore safety nets
    // ------------------------------------------------------------------

    // Volume restore has to happen client-side — Jellyfin 12 exposes no
    // server-side volume API (PlaystateCommand has no SetVolume member, and
    // ISessionManager offers only SendPlaystateCommand). So we cover every
    // plausible exit path from the browser side.

    // Leaving the page mid-fade: restore synchronously before unload.
    var pageHideHandler = function() {
        try { restoreVolume(); } catch (e) { /* best effort */ }
    };

    // Tab hidden mid-fade: if the fade already completed, the volume is 0 and
    // nothing will tick again until the tab returns. Restore on hide so the
    // viewer never comes back to a silent player.
    var visibilityHandler = function() {
        if (document.visibilityState === 'hidden' && originalVolume !== null) {
            try { restoreVolume(); } catch (e) { /* best effort */ }
        }
    };

    try { window.addEventListener('pagehide', pageHideHandler); } catch (e) { /* noop */ }
    try { document.addEventListener('visibilitychange', visibilityHandler); } catch (e) { /* noop */ }


    // ------------------------------------------------------------------
    // Boot — start watching for the OSD
    // ------------------------------------------------------------------

    startOsdWatcher();

})();