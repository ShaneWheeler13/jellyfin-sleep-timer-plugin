// Sleep Timer auto-loader: checks if installed and loads the inject script
// Served as a plugin page so it can be referenced via <script src> (avoids CSP inline-script issues)
(function() {
    // Only run in the top window (not iframes like the config page)
    if (window.top !== window.self) return;

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