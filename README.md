# Jellyfin Sleep Timer Plugin

A sleep timer plugin for [Jellyfin](https://jellyfin.org) that stops media playback after a set duration. Perfect for falling asleep to TV shows without leaving playback running all night.

## Features

- **Preset durations**: 15m, 30m, 45m, 1h, 1.5h, 2h -- no fiddling with custom inputs
- **"Are you still watching?" popup**: When the timer hits zero, a centered dialog appears with a 60-second countdown. Playback only stops if you don't respond or click "Stop Now". Click "Continue Watching" to dismiss and keep playing.
- **Pre-stop notification**: Optional on-screen toast before the popup appears (configurable lead time)
- **Extend on the fly**: Add +15m or +30m to a running timer without restarting it
- **Cancel anytime**: One-click cancel from the sleep timer panel
- **Per-device install/uninstall**: Install and uninstall the player button directly from the plugin config page -- no manual localStorage hacking
- **Dashboard config page**: Set default duration and notification preferences

## Compatibility

- **Jellyfin 10.11+** (targets `net9.0`, ABI `10.11.0.0`)
- Works with the Jellyfin web client
- Player button requires per-device installation (see below)

## Installation

### From Release

1. Download the latest release ZIP from the [Releases page](../../releases)
2. Extract the DLL into your Jellyfin plugins directory:
   - **Linux**: `/config/plugins/SleepTimer/`
   - **Docker**: Mount the plugin directory and place the DLL inside
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
2. Configure your default settings:
   - Default duration (minutes)
   - Pre-stop notification (on/off)
   - Notification lead time (seconds)
3. Click **Save**

### Per-device player button

The sleep timer button isn't automatically added to the web player. Jellyfin's plugin system doesn't support injecting into the player UI natively, so each device needs a one-time install:

1. On the device you watch Jellyfin on, go to **Dashboard > Plugins > Sleep Timer**
2. Click **"Install sleep button"**
3. The moon icon (bedtime) will appear in the video player OSD next to the subtitle button
4. Repeat on each device you want the button on

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
5. A countdown displays in the panel header. Use **+15m**, **+30m**, or **Cancel** as needed

### What happens when the timer ends

1. If pre-stop notification is enabled, an on-screen toast appears (default: 30 seconds before zero)
2. At zero, an **"Are you still watching?"** popup appears with a 60-second countdown
3. **Continue Watching** -- dismisses the popup, cancels the timer, keeps playing
4. **Stop Now** -- stops playback immediately
5. **No response / dismiss** -- playback stops automatically after 60 seconds
6. **Escape key** -- dismisses the popup without stopping (accidental press protection)

## Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| Default Duration | 30 minutes | Default timer duration |
| Pre-Stop Notification | Enabled | Show an on-screen toast before the popup |
| Notification Lead Time | 30 seconds | How far in advance to show the notification |

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
    "NotifyBeforeStop": true,
    "NotifyLeadTimeSeconds": 30
}
```

## Limitations

- The player button requires per-device installation (Jellyfin plugin framework limitation)
- Currently English-only (no localization)
- Volume fade is not yet implemented (planned for future release)
- Web client only -- does not work in native Jellyfin apps (Android TV, iOS, Roku, etc.)

## Tech Stack

- **Backend**: C# / .NET 9, Jellyfin Plugin SDK 10.11
- **Frontend**: Vanilla JavaScript, embedded in DLL as resources
- **Build**: `dotnet build` with standard MSBuild

## License

MIT

## Contributing

This is an open project. Feel free to open issues, submit PRs, or suggest features.

## Potential Future Updates

- Volume fade before stopping
- Client app support (Android TV, iOS, Roku, etc.)
- Localization
- Auto-install player button (if Jellyfin adds plugin injection support)
- Per-user default timer profiles