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
            document.getElementById('showNotification').checked = config.ShowNotification !== false;
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
            ShowNotification: document.getElementById('showNotification').checked
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

loadConfig();