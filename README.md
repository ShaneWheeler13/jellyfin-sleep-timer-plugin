# Jellyfin Sleep Timer Plugin

A sleep timer plugin for [Jellyfin](https://jellyfin.org) that stops media playback after a set duration. Perfect for falling asleep to TV shows without leaving playback running all night.

## Features

- **Preset durations**: 15m, 30m, 45m, 1h, 1.5h, 2h
- **OSD countdown display**: Live countdown next to the bedtime button in the player -- always visible while a timer is running
- **One-click clear**: Clear button (X) next to the countdown stops the timer without navigating into the panel
- **"Are you still watching?" popup**: When the timer hits zero, a centered dialog appears with a 60-second countdown. Playback only stops if you don't respond or click "Stop Now". Click "Continue Watching" to dismiss and keep playing.
- **Pre-stop notification**: Optional on-screen toast before the popup appears
- **Extend on the fly**: Add +15m or +30m to a running timer without restarting it
- **Cancel anytime**: One-click cancel from the sleep timer panel or the OSD clear button
- **Per-device install/uninstall**: Install and uninstall the player button directly from the plugin config page -- no manual localStorage hacking
- **Server-side persistence**: The plugin injects an auto-loader into Jellyfin's web pages via middleware, so the sleep timer button survives server restarts automatically
- **Cross-browser compatible**: Works on Chrome, Firefox, Safari, Edge, and older browsers (no `eval`, no `padStart`, no flexbox `gap` dependency)
- **Dashboard config page**: Toggle pre-stop notification

## Compatibility

- **Jellyfin 10.11+** (targets `net9.0`, ABI `10.11.0.0`)
- Works with the Jellyfin web client
- Player button requires per-device installation (see below)
- Tested on Chrome, Firefox, Safari, and Edge

## Installation

### Auto-Update via Plugin Repository

Add this repository URL to Jellyfin for automatic updates:

```
https://raw.githubusercontent.com/ShaneWheeler13/jellyfin-plugin-sleep-timer/main/manifest.json
```

1. Go to **Dashboard > Plugins > Repositories**
2. Click the **+** button
3. Paste the URL above
4. Click **Save**
5. The Sleep Timer plugin will appear under **Dashboard > Plugins > Catalog**
6. Install from there and enable auto-update

### From Release

1. Download the latest release ZIP from the [Releases page](../../releases)
2. Extract the DLL into your Jellyfin plugins directory:
   - **Linux**: `/config/plugins/SleepTimer/`
   - **Docker**: Mount the plugin directory and place the DLL inside
   - **Windows**: `C:\ProgramData\Jellyfin\plugins\SleepTimer\`
3. Restart Jellyfin
4. Go to **Dashboard > Plugins > Sleep Timer** to configure

### Building from Source

Requirements:
- [.NET 9 SDK](https://dotnet.microsoft.com/download/dotnet/9.0)
- Jellyfin 10.11+ (for testing)

```bash
git clone https://github.com/ShaneWheeler13/jellyfin-plugin-sleep-timer.git
cd jellyfin-plugin-sleep-timer/Jellyfin.Plugin.SleepTimer
dotnet build -c Release
```

The built DLL will be at `bin/Release/net9.0/Jellyfin.Plugin.SleepTimer.dll`. Copy it to your Jellyfin plugins directory and restart.

## Setup

### Server-side

After installing the plugin and restarting Jellyfin:

1. Go to **Dashboard > Plugins > Sleep Timer**
2. Toggle the pre-stop notification on/off
3. Click **Save**

### Per-device player button

The sleep timer button isn't automatically added to the web player. Jellyfin's plugin system doesn't support injecting into the player UI natively, so each device needs a one-time install:

1. On the device you watch Jellyfin on, go to **Dashboard > Plugins > Sleep Timer**
2. Click **"Install sleep button"**
3. The moon icon (bedtime) will appear in the video player OSD next to the subtitle button
4. Repeat on each device you want the button on

Once installed, the button persists across server restarts and page reloads via server-side middleware injection. No need to reinstall after updates.

### Uninstalling the player button

To remove the sleep timer button from a device:

1. Go to **Dashboard > Plugins > Sleep Timer** on that device
2. Click **"Uninstall"** (next to the Install button)
3. The button, panel, and any active popup are immediately removed
4. The script is cleared from the browser's `localStorage`

No server restart needed -- install and uninstall take effect instantly.

## Usage

### Setting a timer

1. Play any video
2. Click the moon icon in the player controls
3. Choose a preset duration (15m, 30m, 45m, 1h, 1.5h, 2h)
4. The panel auto-closes after 4 seconds of inactivity
5. A countdown displays in the panel header and in the OSD next to the bedtime button

### Monitoring the timer

- **OSD countdown**: Shows remaining time next to the bedtime button (e.g. "29:42"). Visible whenever the player OSD is visible and a timer is active.
- **Clear button (X)**: Click the X next to the countdown to clear the timer immediately. The sleep timer will not reactivate until you set a new duration.
- **Panel**: Click the moon icon again to open the panel. Use **+15m**, **+30m**, or **Cancel** as needed.

### What happens when the timer ends

1. If pre-stop notification is enabled, an on-screen toast appears 30 seconds before zero
2. At zero, an **"Are you still watching?"** popup appears with a 60-second countdown
3. **Continue Watching** -- dismisses the popup, cancels the timer, keeps playing
4. **Stop Now** -- stops playback immediately
5. **No response / dismiss** -- playback stops automatically after 60 seconds
6. **Escape key** -- dismisses the popup without stopping (accidental press protection)

## Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| Pre-Stop Notification | Enabled | Show an on-screen toast before the popup |

## API Endpoints

The plugin exposes REST endpoints under `/SleepTimer/`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/SleepTimer/Config` | Get plugin configuration |
| POST | `/SleepTimer/Config` | Save plugin configuration |
| GET | `/SleepTimer/Timers` | List all active timers |
| GET | `/SleepTimer/Timer/{sessionId}` | Get timer for a specific session |
| POST | `/SleepTimer/Start` | Start a sleep timer |
| DELETE | `/SleepTimer/Cancel/{sessionId}` | Cancel a timer |
| POST | `/SleepTimer/Extend` | Extend a running timer |

### Start Timer Example

```json
POST /SleepTimer/Start
{
    "UserId": "b776d728-908e-4837-9bc7-56041eabf40a",
    "DurationMinutes": 30,
    "NotifyBeforeStop": true
}
```

## Limitations

- The player button requires per-device installation (Jellyfin plugin framework limitation)
- Web client only -- does not work in native Jellyfin apps (Android TV, iOS, Roku, etc.)

## Tech Stack

- **Backend**: C# / .NET 9, Jellyfin Plugin SDK 10.11
- **Frontend**: Vanilla JavaScript, embedded in DLL as resources
- **Build**: `dotnet build` with standard MSBuild

## License

MIT

## Contributing

This is an open project. Feel free to open issues, submit PRs, or suggest features.