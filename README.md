# claudex

Run [Claude Code](https://docs.anthropic.com/en/docs/claude-code) against any
Anthropic-compatible backend through a **local proxy daemon**. Claude Code only
ever sees `http://127.0.0.1:<port>` + a dummy token; your real API keys live in
the daemon, and per-model routing lets one session mix providers (e.g. sonnet
via Z.AI, haiku via Qwen).

```
claude ──► claudexd (127.0.0.1:17865) ──routes by model──► provider A / provider B ...
          └ keys, nowhere else
```

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/HikaruEgashira/claudex/main/install.sh | bash
```

## Setup

```sh
claudex --setup              # interactive: add providers, pick role defaults
claudex --setup zai          # CLI: token from $ZAI_AUTH_TOKEN (or --token)
claudex --setup zai qwen --token sk-xxx   # note: --token applies to all named presets
claudex --setup --reset      # wipe config + keys
claudex config               # show current config.json
```

Proxy-compatible presets (`presets/`): `anthropic`, `zai`, `openrouter`, `qwen`.
`bedrock`, `vertex`, `foundry` use native Claude Code modes and are **not**
supported through the proxy — configure those in Claude Code settings directly.

Secrets are written to an encrypted `.env` (dotenvx) and referenced from
`config.json` as `${ZAI_AUTH_TOKEN}` — plaintext never touches disk or Claude
Code's environment.

## Routing

Per-model routing lives in `~/.config/claudex/config.json` (hand-edit):

```json
{
  "port": 17865,
  "defaultProvider": "zai",
  "providers": {
    "zai":  { "baseUrl": "https://api.z.ai/api/anthropic",           "authToken": "${ZAI_AUTH_TOKEN}" },
    "qwen": { "baseUrl": "https://coding-intl.dashscope.aliyuncs.com/apps/anthropic", "authToken": "${QWEN_AUTH_TOKEN}" }
  },
  "routes": {
    "glm-5.3": "zai",
    "qwen3-coder-next": "qwen"
  },
  "defaults": { "opus": "glm-5.3", "sonnet": "glm-5.3-flash", "haiku": "qwen3-coder-next" }
}
```

- `routes.<model>` decides the upstream for `POST /v1/messages` and
  `POST /v1/messages/count_tokens`; unknown models fall back to
  `defaultProvider`.
- `defaults.*` are injected as `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL`
  so Claude Code picks the routed models. `GET /v1/models` also serves the
  routed catalog for the model picker.
- Per-provider `"auth": "authorization"` is supported for upstreams that want a
  `Bearer` header instead of `x-api-key` (default).

## Usage

```sh
claudex              # starts the daemon if needed, then runs Claude Code
claudex -p "..."     # one-shot prompt
claudex start|stop|status|restart
claudex --self-test  # proxy self-test (routing, SSE, auth swap)
```

`claudex` is a thin wrapper: it ensures the daemon is up, injects
`ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN`/model slots, and `exec`s `claude`
with your flags. If `~/.claude/settings.json` sets `ANTHROPIC_*` env vars,
remove them so they don't override the proxy wiring.

Config lives at `${XDG_CONFIG_HOME:-~/.config}/claudex/`
(`config.json`, encrypted `.env`, `.env.keys`, `daemon.log`).

## Dependencies

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- [Node.js](https://nodejs.org) 18+ (proxy; zero npm deps)
- [dotenvx](https://dotenvx.com/docs/install) (encrypted secrets)

## License

MIT