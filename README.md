# Sleep Timer Plugin for Jellyfin

A sleep timer plugin for [Jellyfin](https://jellyfin.org/) that stops media playback after a set duration. Perfect for falling asleep to TV shows without leaving playback running all night.

## Features

- Preset durations: 15m, 30m, 45m, 1h, 1.5h, 2h
- OSD countdown display: Live countdown next to the bedtime button in the player — always visible while a timer is running
- One-click clear: Clear button (X) next to the countdown stops the timer without navigating into the panel
- "Are you still watching?" popup: When the timer hits zero, a centered dialog appears with a 60-second countdown. Playback only stops if you don't respond or click "Stop Now". Click "Continue Watching" to dismiss and keep playing.
- Extend on the fly: Add +5m, +15m, or +30m to a running timer without restarting it
- Cancel anytime: One-click cancel from the sleep timer panel or the OSD clear button
- Per-device install/uninstall: Install and uninstall the player button directly from the plugin config page
- Server-side persistence: The sleep timer button survives server restarts and page reloads automatically via middleware injection
- Cross-browser compatible: Works on Chrome, Firefox, Safari, and Edge
- Configurable grace period: Server-side config for popup grace period duration and enable/disable popup entirely
- Dashboard config page: Plugin configuration page

## Requirements

- **Jellyfin 12.0+** (targets .NET 10, ABI 12.0.0.0)
- Works with the Jellyfin web client
- Player button requires per-device installation (see below)
- Tested on Chrome, Firefox, Safari, and Edge

> **Note:** If you're still on Jellyfin 10.11, use [v1.3.1](https://github.com/ShaneWheeler13/jellyfin-sleep-timer-plugin/releases/tag/v1.3.1) instead.

## Installation

### Via Plugin Repository (recommended)

Add this repository URL to Jellyfin for automatic updates:

```
https://raw.githubusercontent.com/ShaneWheeler13/jellyfin-sleep-timer-plugin/main/manifest.json
```

- Go to Dashboard > Plugins > Repositories
- Click the + button
- Paste the URL above
- Click Save
- The Sleep Timer plugin will appear under Dashboard > Plugins > Catalog
- Install from there and enable auto-update

### Manual Install

- Download the latest release ZIP from the [Releases page](https://github.com/ShaneWheeler13/jellyfin-sleep-timer-plugin/releases)
- Extract the DLL into your Jellyfin plugins directory:
  - **Linux:** `/config/plugins/SleepTimer/`
  - **Docker:** Mount the plugin directory and place the DLL inside
  - **Windows:** `C:\ProgramData\Jellyfin\plugins\SleepTimer\`
- Restart Jellyfin
- Go to Dashboard > Plugins > Sleep Timer to configure

## Development

Requirements:

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- Jellyfin 12.0+ (for testing)

```bash
git clone https://github.com/ShaneWheeler13/jellyfin-sleep-timer-plugin.git
cd jellyfin-sleep-timer-plugin/Jellyfin.Plugin.SleepTimer
dotnet build -c Release
```

The built DLL will be at `bin/Release/net10.0/Jellyfin.Plugin.SleepTimer.dll`. Copy it to your Jellyfin plugins directory and restart.

## Per-Device Button Installation

The sleep timer button isn't automatically added to the web player. Each device needs a one-time install:

- On the device you watch Jellyfin on, go to **Dashboard > Plugins > Sleep Timer**
- Click **"Install sleep button"**
- The moon icon (bedtime) will appear in the video player OSD next to the subtitle button
- Repeat on each device you want the button on

Once installed, the button persists across server restarts and page reloads. No need to reinstall after updates.

To remove the sleep timer button from a device:

- Go to **Dashboard > Plugins > Sleep Timer** on that device
- Click **"Uninstall"** (next to the Install button)
- The button, panel, and any active popup are immediately removed
- Done — no server restart needed

## Usage

- Play any video
- Click the moon icon in the player controls
- Choose a preset duration (15m, 30m, 45m, 1h, 1.5h, 2h)
- A countdown appears in the OSD next to the bedtime button
- Click the moon icon again to reopen the panel and use +5m, +15m, +30m, or Cancel
- Click the X next to the countdown to clear the timer without opening the panel

When the timer reaches zero, an "Are you still watching?" popup appears with a 60-second countdown:

- **Continue Watching** — dismisses the popup, keeps playing
- **Stop Now** — stops playback immediately
- **No response** — playback stops after 60 seconds
- **Escape** — dismisses without stopping (accidental press protection)

## Configuration

Server-side configuration is available under **Dashboard > Plugins > Sleep Timer**:

- **Default Duration:** Default timer duration in minutes (informational)
- **Popup Grace Period:** How long (in seconds) the popup stays before auto-stopping. Set to 0 to disable the popup entirely
- **Enable Popup:** Toggle the "Are you still watching?" popup on/off. When disabled, playback stops immediately when the timer expires

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

### Example: Start a timer
```json
POST /SleepTimer/Start
{
  "UserId": "b776d728-908e-4837-9bc7-56041eabf40a",
  "DurationMinutes": 30
}
```

### Example: Popup response
```json
POST /SleepTimer/PopupResponse
{
  "UserId": "b776d728-908e-4837-9bc7-56041eabf40a",
  "Action": "continue"
}
```

Action can be "continue" (user dismissed the popup, keep playing) or "stop" (user clicked Stop Now or popup timed out).

## Architecture

The server is the source of truth for timer state. The client calls the API for every action (start, extend, cancel, popup response). When the timer reaches zero, the server transitions to a PopupPending state and waits up to 60 seconds (configurable) for the client to report the user's response. If the client never responds (closed tab, crashed, page refresh), the server stops playback as a fallback.

On page load, the client syncs with the server via `GET /SleepTimer/TimerByUser/{userId}` — if a timer is already running, it resumes the countdown from the server's EndTime. This means refreshing the page no longer loses your timer.

## Limitations

- The player button requires per-device installation (Jellyfin plugin framework limitation)
- Web client only — does not work in native Jellyfin apps (Android TV, iOS, Roku, etc.)
- Timers are keyed by session ID, which is per-device. If you start a timer on your phone and then switch to the TV, the phone's timer will still fire (and stop playback on the phone) while the TV has no timer. This is fine for the typical sleep timer use case (one device, falling asleep) but worth knowing.

## Tech Stack

- Backend: C# / .NET 10, Jellyfin Plugin SDK 12.0
- Frontend: Vanilla JavaScript, embedded in DLL as resources

## License

MIT

## Contributing

This is an open project. Feel free to open issues, submit PRs, or suggest features.