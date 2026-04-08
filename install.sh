#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${HOME}/.local/bin"
REPO_RAW="https://raw.githubusercontent.com/HikaruEgashira/zlaude/main"

mkdir -p "$INSTALL_DIR"
curl -fsSL "${REPO_RAW}/zlaude" -o "${INSTALL_DIR}/zlaude"
chmod +x "${INSTALL_DIR}/zlaude"

case ":${PATH}:" in
  *:"${INSTALL_DIR}":*) ;;
  *) echo "warning: ${INSTALL_DIR} is not in your PATH. Add it with:" >&2
     echo "  export PATH=\"\${HOME}/.local/bin:\${PATH}\"" >&2 ;;
esac

echo "Installed zlaude to ${INSTALL_DIR}/zlaude"
echo "Run 'zlaude --setup' to configure your API credentials."
