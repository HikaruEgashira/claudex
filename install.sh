#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${HOME}/.local/share/claudex"
BIN_DIR="${HOME}/.local/bin"
REPO_RAW="https://raw.githubusercontent.com/HikaruEgashira/claudex/main"
PRESETS=(anthropic zai openrouter bedrock vertex foundry qwen)

mkdir -p "$INSTALL_DIR/presets" "$BIN_DIR"

curl -fsSL "${REPO_RAW}/claudex" -o "${INSTALL_DIR}/claudex"
chmod +x "${INSTALL_DIR}/claudex"

for preset in "${PRESETS[@]}"; do
  curl -fsSL "${REPO_RAW}/presets/${preset}.env" -o "${INSTALL_DIR}/presets/${preset}.env"
done

ln -sf "${INSTALL_DIR}/claudex" "${BIN_DIR}/claudex"

case ":${PATH}:" in
  *:"${BIN_DIR}":*) ;;
  *) echo "warning: ${BIN_DIR} is not in your PATH. Add it with:" >&2
     echo "  export PATH=\"\${HOME}/.local/bin:\${PATH}\"" >&2 ;;
esac

echo "Installed claudex to ${INSTALL_DIR}"
echo "Run 'claudex --setup' to configure your API credentials."
