# Jellyfin Sleep Timer Plugin

A sleep timer plugin for [Jellyfin](https://jellyfin.org) that automatically stops media playback after a set duration or number of episodes. Perfect for falling asleep to TV shows without leaving playback running all night.

## Features

- **Time-based timer**: Set a countdown (15m, 30m, 45m, 1h, 1.5h, 2h, or custom) and playback stops automatically when it reaches zero
- **Episode-based timer**: Stop after a specific number of episodes finish playing (1, 2, 3, 5, or custom)
- **Pre-stop notification**: Optional on-screen notification before playback stops (configurable lead time)
- **Extend on the fly**: Add +15m or +30m to a running timer without restarting it
- **Cancel anytime**: One-click cancel from the sleep timer panel
- **Dashboard config page**: Set default duration, notification preferences, and install the player button per device

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
2. Click **"Install sleep button on this device"**
3. The moon icon (bedtime) will appear in the video player OSD next to the subtitle button
4. Repeat on each device you want the button on

The install stores a script in your browser's `localStorage` and auto-loads it on future visits. No server-side changes are needed.

## Usage

### Time-based timer

1. Play any video
2. Click the moon icon in the player controls
3. Choose a preset duration or enter a custom number of minutes
4. Click **Start**
5. A countdown displays in the panel. Use **+15m**, **+30m**, or **Cancel** as needed

### Episode-based timer

1. Play a TV show
2. Click the moon icon
3. Switch to **Episodes** mode
4. Choose how many episodes to play before stopping
5. Playback stops after that many episodes finish

### What happens when the timer ends

- If pre-stop notification is enabled, an on-screen message appears (default: 30 seconds before stopping)
- At zero, playback is stopped via the Jellyfin API

## Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| Default Duration | 30 minutes | Default timer duration when using custom input |
| Pre-Stop Notification | Enabled | Show an on-screen notification before stopping |
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
- Episode counting relies on Jellyfin's navigation events and may not work perfectly on all client types
- Currently English-only (no localization)
- Volume fade is not yet implemented (planned for future release)

## Tech Stack

- **Backend**: C# / .NET 9, Jellyfin Plugin SDK 10.11
- **Frontend**: Vanilla JavaScript, embedded in DLL as resources
- **Build**: `dotnet build` with standard MSBuild

## License

MIT

## Contributing

This is an open project. Feel free to open issues, submit PRs, or suggest features.

## Roadmap

- [ ] Volume fade before stopping
- [ ] Client app support (Android TV, iOS, etc.)
- [ ] Localization
- [ ] Auto-install player button (if Jellyfin adds plugin injection support)
- [ ] Per-user default timer profiles