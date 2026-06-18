// Sleep Timer - Config page helper
// Handles loading/saving config and managing the player button installer

async function loadConfig() {
    try {
        const apiClient = await getApiClient();
        if (!apiClient) return;

        // Fetch config from plugin API
        const res = await fetch(apiClient.serverAddress + '/SleepTimer/Config', {
            headers: { 'X-Emby-Token': apiClient.accessToken() }
        });
        if (res.ok) {
            const config = await res.json();
            document.getElementById('defaultDuration').value = config.DefaultDurationMinutes || 30;
            document.getElementById('showNotification').checked = config.ShowNotification !== false;
            document.getElementById('notifyLeadTime').value = config.NotificationLeadTimeSeconds || 30;
        }
    } catch (e) {
        console.error('[SleepTimer] Failed to load config:', e);
    }
}

async function saveConfig() {
    try {
        const apiClient = await getApiClient();
        if (!apiClient) { alert('Not connected'); return; }

        const config = {
            DefaultDurationMinutes: parseInt(document.getElementById('defaultDuration').value),
            ShowNotification: document.getElementById('showNotification').checked,
            NotificationLeadTimeSeconds: parseInt(document.getElementById('notifyLeadTime').value)
        };

        const res = await fetch(apiClient.serverAddress + '/SleepTimer/Config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Emby-Token': apiClient.accessToken()
            },
            body: JSON.stringify(config)
        });

        if (res.ok) {
            alert('Configuration saved');
        } else {
            alert('Failed to save configuration');
        }
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

function getApiClient() {
    return Promise.resolve(window.ApiClient || (window.Connections && window.Connections.currentApiClient()));
}

// Auto-load the inject script if previously installed on this device
(function autoLoad() {
    if (localStorage.getItem('sleeptimer_installed') === 'true') {
        const code = localStorage.getItem('sleeptimer_code');
        if (code) {
            try {
                new Function(code)();
            } catch(e) {
                console.error('[SleepTimer] Auto-load error:', e);
            }
        }
    }
})();

// Also run on every page navigation
document.addEventListener('viewshow', function() {
    if (localStorage.getItem('sleeptimer_installed') === 'true') {
        const code = localStorage.getItem('sleeptimer_code');
        if (code) {
            try {
                new Function(code)();
            } catch(e) {
                console.error('[SleepTimer] viewshow inject error:', e);
            }
        }
    }
});

loadConfig();