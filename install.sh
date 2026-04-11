#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${HOME}/.local/share/zlaude"
BIN_DIR="${HOME}/.local/bin"
REPO_RAW="https://raw.githubusercontent.com/HikaruEgashira/zlaude/main"
PRESETS=(zai openrouter)

mkdir -p "$INSTALL_DIR/presets" "$BIN_DIR"

curl -fsSL "${REPO_RAW}/zlaude" -o "${INSTALL_DIR}/zlaude"
chmod +x "${INSTALL_DIR}/zlaude"

for preset in "${PRESETS[@]}"; do
  curl -fsSL "${REPO_RAW}/presets/${preset}.env" -o "${INSTALL_DIR}/presets/${preset}.env"
done

ln -sf "${INSTALL_DIR}/zlaude" "${BIN_DIR}/zlaude"

case ":${PATH}:" in
  *:"${BIN_DIR}":*) ;;
  *) echo "warning: ${BIN_DIR} is not in your PATH. Add it with:" >&2
     echo "  export PATH=\"\${HOME}/.local/bin:\${PATH}\"" >&2 ;;
esac

echo "Installed zlaude to ${INSTALL_DIR}"
echo "Run 'zlaude --setup' to configure your API credentials."
