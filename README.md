# zlaude

Use [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with alternative API-compatible backends.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/HikaruEgashira/zlaude/main/install.sh | bash
```

## Setup

```sh
zlaude --setup              # list available presets
zlaude --setup <preset>     # configure with a preset
```

| Preset | Backend |
|---|---|
| `anthropic` | Anthropic API (direct) |
| `zai` | Z.AI GLM proxy |
| `openrouter` | OpenRouter |
| `bedrock` | AWS Bedrock |
| `vertex` | Google Cloud Vertex AI |
| `foundry` | Microsoft Foundry (Azure) |
| `qwen` | Alibaba Cloud Coding Plan (Qwen) |

See [`presets/`](presets/) for details. To add a custom backend, create a new `.env` file in the presets directory.

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
