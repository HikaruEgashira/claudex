# zlaude

Use [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with alternative API-compatible backends.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/HikaruEgashira/zlaude/main/install.sh | bash
```

## Setup

```sh
zlaude --setup          # list available presets
zlaude --setup zai      # setup with z.ai preset
zlaude --setup openrouter  # setup with OpenRouter preset
```

See [`presets/`](presets/) for available configurations.

## Usage

```sh
zlaude          # interactive mode
zlaude -p "..." # one-shot prompt
```

All Claude Code flags and options work as-is.

## Dependencies

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- [dotenvx](https://dotenvx.com/docs/install)

## Config

Config is stored at `${XDG_CONFIG_HOME:-$HOME/.config}/zlaude/.env`.

To edit manually:

```sh
$EDITOR "${XDG_CONFIG_HOME:-$HOME/.config}/zlaude/.env"
```

## Uninstall

```sh
rm ~/.local/bin/zlaude
rm -rf ~/.local/share/zlaude
rm -rf "${XDG_CONFIG_HOME:-$HOME/.config}/zlaude"
```

## License

MIT
