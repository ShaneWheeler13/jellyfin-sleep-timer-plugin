// Sleep Timer auto-loader
//
// Injected into Jellyfin's main HTML by SleepTimerMiddleware. Checks
// localStorage for the install flag and, if set, loads the full client
// injection script. Served as a plugin page so it can be referenced via
// <script src> (avoids CSP inline-script restrictions).
(function() {
    // Skip iframes (config page, etc.) — only run in the top window
    if (window.top !== window.self) return;

    // Only load if the user has installed the button on this device
    if (localStorage.getItem('sleeptimer_installed') !== 'true') return;

    // Remove any previous inject script
    var old = document.getElementById('sleepTimerInjectScript');
    if (old) old.remove();

    var s = document.createElement('script');
    s.id = 'sleepTimerInjectScript';
    s.src = '/web/ConfigurationPage?name=sleep-timer-inject.js';
    s.onload = function() {
        console.log('[SleepTimer] Inject script loaded via auto-loader');
    };
    s.onerror = function() {
        console.error('[SleepTimer] Failed to load inject script');
    };
    document.head.appendChild(s);
})();