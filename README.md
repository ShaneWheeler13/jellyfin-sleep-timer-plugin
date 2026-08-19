# Jellyfin Sleep Timer Plugin

A sleep timer plugin for [Jellyfin](https://jellyfin.org) that stops media playback after a set duration. Perfect for falling asleep to TV shows without leaving playback running all night.

## Features

- **Preset durations**: 15m, 30m, 45m, 1h, 1.5h, 2h
- **Custom duration**: Type any number of minutes (1–600) for a non-preset timer
- **OSD countdown display**: Live countdown next to the bedtime button in the player -- always visible while a timer is running
- **One-click clear**: Clear button (X) next to the countdown stops the timer without navigating into the panel
- **"Are you still watching?" popup**: When the timer hits zero, a centered dialog appears with a 60-second countdown. Playback only stops if you don't respond or click "Stop Now". Click "Continue Watching" to dismiss and keep playing.
- **Extend on the fly**: Add +15m or +30m to a running timer without restarting it
- **Cancel anytime**: One-click cancel from the sleep timer panel or the OSD clear button
- **Per-device install/uninstall**: Install and uninstall the player button directly from the plugin config page
- **Server-side persistence**: The sleep timer button survives server restarts and page reloads automatically via middleware injection
- **Cross-browser compatible**: Works on Chrome, Firefox, Safari, and Edge
- **Dashboard config page**: Plugin configuration page

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

1. Download the latest release ZIP from the [Releases page](https://github.com/ShaneWheeler13/jellyfin-plugin-sleep-timer/releases)
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

### Per-device player button

The sleep timer button isn't automatically added to the web player. Each device needs a one-time install:

1. On the device you watch Jellyfin on, go to **Dashboard > Plugins > Sleep Timer**
2. Click **"Install sleep button"**
3. The moon icon (bedtime) will appear in the video player OSD next to the subtitle button
4. Repeat on each device you want the button on

Once installed, the button persists across server restarts and page reloads. No need to reinstall after updates.

### Uninstalling the player button

To remove the sleep timer button from a device:

1. Go to **Dashboard > Plugins > Sleep Timer** on that device
2. Click **"Uninstall"** (next to the Install button)
3. The button, panel, and any active popup are immediately removed
4. Done -- no server restart needed

## Usage

1. Play any video
2. Click the moon icon in the player controls
3. Choose a preset duration (15m, 30m, 45m, 1h, 1.5h, 2h) or type a custom number of minutes
4. A countdown appears in the OSD next to the bedtime button
5. Click the moon icon again to reopen the panel and use **+15m**, **+30m**, or **Cancel**
6. Click the **X** next to the countdown to clear the timer without opening the panel

When the timer reaches zero, an **"Are you still watching?"** popup appears with a 60-second countdown:

- **Continue Watching** -- dismisses the popup, keeps playing
- **Stop Now** -- stops playback immediately
- **No response** -- playback stops after 60 seconds
- **Escape** -- dismisses without stopping (accidental press protection)

## API Endpoints

The plugin exposes REST endpoints under `/SleepTimer/`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/SleepTimer/Timers` | List all active timers |
| GET | `/SleepTimer/Timer/{sessionId}` | Get timer for a specific session |
| GET | `/SleepTimer/TimerByUser/{userId}` | Get timer for a user (used by client on page load) |
| POST | `/SleepTimer/Start` | Start a sleep timer |
| DELETE | `/SleepTimer/Cancel/{sessionId}` | Cancel a timer |
| POST | `/SleepTimer/Extend` | Extend a running timer |
| POST | `/SleepTimer/PopupResponse` | Report user's response to the popup ("continue" or "stop") |

### Start Timer Example

```json
POST /SleepTimer/Start
{
    "UserId": "b776d728-908e-4837-9bc7-56041eabf40a",
    "DurationMinutes": 30
}
```

### Popup Response Example

```json
POST /SleepTimer/PopupResponse
{
    "UserId": "b776d728-908e-4837-9bc7-56041eabf40a",
    "Action": "continue"
}
```

`Action` can be `"continue"` (user dismissed the popup, keep playing) or `"stop"` (user clicked Stop Now or popup timed out).

## Architecture

The **server is the source of truth** for timer state. The client calls the API for every action (start, extend, cancel, popup response). When the timer reaches zero, the server transitions to a `PopupPending` state and waits up to 60 seconds for the client to report the user's response. If the client never responds (closed tab, crashed, page refresh), the server stops playback as a fallback.

On page load, the client syncs with the server via `GET /SleepTimer/TimerByUser/{userId}` — if a timer is already running, it resumes the countdown from the server's `EndTime`. This means refreshing the page no longer loses your timer.

## Limitations

- The player button requires per-device installation (Jellyfin plugin framework limitation)
- Web client only -- does not work in native Jellyfin apps (Android TV, iOS, Roku, etc.)
- Timers are keyed by session ID, which is per-device. If you start a timer on your phone and then switch to the TV, the phone's timer will still fire (and stop playback on the phone) while the TV has no timer. This is fine for the typical sleep timer use case (one device, falling asleep) but worth knowing.

## Tech Stack

- **Backend**: C# / .NET 9, Jellyfin Plugin SDK 10.11
- **Frontend**: Vanilla JavaScript, embedded in DLL as resources

## License

MIT

## Contributing

This is an open project. Feel free to open issues, submit PRs, or suggest features.