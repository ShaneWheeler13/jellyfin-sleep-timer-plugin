# Contributing to Jellyfin Sleep Timer

Thanks for your interest in improving this plugin!

## Reporting Issues

- Include your Jellyfin version and the plugin version.
- Describe the steps to reproduce the problem.
- Check the browser console (F12) for `[SleepTimer]` log messages and include any errors.
- Note which browser and device you're using.

## Pull Requests

1. Fork the repo and create a feature branch.
2. Build and test locally:
   ```bash
   cd Jellyfin.Plugin.SleepTimer
   dotnet build -c Release
   ```
3. Copy the built DLL to your Jellyfin plugins directory and restart Jellyfin to test.
4. Keep changes focused — one feature or fix per PR.
5. Update the README if you add or change user-facing behavior.

## Development Notes

- The server is the source of truth for timer state. The client calls the API for every action (start, extend, cancel, popup response).
- Frontend code is vanilla JavaScript embedded as resources in the DLL — no build step needed for JS.
- The plugin targets .NET 9 and Jellyfin 10.11+ (ABI `10.11.0.0`).

## Releasing

Releases are managed via GitHub Releases. Binary ZIPs should not be committed to the repo — attach them as release artifacts instead. Update `manifest.json` with the new version, checksum, and source URL.