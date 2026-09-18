#!/usr/bin/env bash
set -euo pipefail

# NodePulse Agent Installer
# Usage:
#   sudo NP_HUB="wss://status.example.com/ws/agent" NP_VERSION="0.1.0" \
#        NP_SHA256_AMD64="<sha>" NP_SHA256_ARM64="<sha>" bash /tmp/np-install.sh
# Prompt / read token strictly from STDIN (never pass token in CLI arguments)

if [ "$(id -u)" -ne 0 ]; then
  echo "Error: this installer must be run as root (e.g. sudo)." >&2
  exit 1
fi

if [ -z "${NP_HUB:-}" ]; then
  echo "Error: NP_HUB environment variable is required (e.g. wss://example.com/ws/agent)." >&2
  exit 1
fi

VERSION="${NP_VERSION:-0.1.0}"
ARCH="$(uname -m)"
case "${ARCH}" in
  x86_64|amd64)
    ARCH_NAME="amd64"
    EXPECTED_SHA="${NP_SHA256_AMD64:-}"
    ;;
  aarch64|arm64)
    ARCH_NAME="arm64"
    EXPECTED_SHA="${NP_SHA256_ARM64:-}"
    ;;
  *)
    echo "Error: unsupported architecture: ${ARCH}" >&2
    exit 1
    ;;
esac

GITHUB_REPO="${NP_REPO:-jsongmax/NodePulse}"
DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/v${VERSION}/nodepulse-agent_linux_${ARCH_NAME}"

# 1. Read token strictly from stdin
if [ -t 0 ]; then
  echo -n "Please paste your Server Token (format: np1.<serverId>.<secret>): "
  read -r TOKEN
else
  # Read from pipe/redirected stdin
  TOKEN="$(cat - | tr -d '\r\n')"
fi

if [ -z "${TOKEN}" ]; then
  echo "Error: token cannot be empty." >&2
  exit 1
fi

if [[ ! "${TOKEN}" =~ ^np1\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$ ]]; then
  echo "Error: token does not match expected format np1.<serverId>.<secret>" >&2
  exit 1
fi

TMP_BIN="/tmp/nodepulse-agent-download.$$"
trap 'rm -f "${TMP_BIN}"' EXIT

echo "Downloading nodepulse-agent v${VERSION} (${ARCH_NAME})..."
if [ -n "${NP_LOCAL_BIN:-}" ] && [ -f "${NP_LOCAL_BIN}" ]; then
  echo "Using local binary provided via NP_LOCAL_BIN: ${NP_LOCAL_BIN}"
  cp "${NP_LOCAL_BIN}" "${TMP_BIN}"
else
  curl -fsSL "${DOWNLOAD_URL}" -o "${TMP_BIN}"
fi

# 2. Verify SHA256 if provided
if [ -n "${EXPECTED_SHA}" ]; then
  ACTUAL_SHA="$(sha256sum "${TMP_BIN}" | awk '{print $1}')"
  if [ "${ACTUAL_SHA}" != "${EXPECTED_SHA}" ]; then
    echo "Error: SHA-256 mismatch!" >&2
    echo "Expected: ${EXPECTED_SHA}" >&2
    echo "Actual:   ${ACTUAL_SHA}" >&2
    exit 1
  fi
  echo "SHA-256 verification passed."
fi

# 3. Create nodepulse user and directories
if ! id -u nodepulse >/dev/null 2>&1; then
  echo "Creating system user 'nodepulse'..."
  useradd -r -s /usr/sbin/nologin -d /nonexistent -M nodepulse
fi

mkdir -p /etc/nodepulse
mkdir -p /var/log/nodepulse
chown nodepulse:nodepulse /var/log/nodepulse
chmod 0750 /var/log/nodepulse

# 4. Install binary
install -m 0755 "${TMP_BIN}" /usr/local/bin/nodepulse-agent

# 5. Write config file (0600, owner nodepulse)
cat <<EOF > /etc/nodepulse/agent.yaml
hub: "${NP_HUB}"
token: "${TOKEN}"
interval: 10
disks:
  - "/"
nics_exclude:
  - "lo"
  - "docker"
  - "veth"
report_public_ip: false
EOF
chown nodepulse:nodepulse /etc/nodepulse/agent.yaml
chmod 0600 /etc/nodepulse/agent.yaml

# 6. Install systemd service
cat <<'EOF' > /etc/systemd/system/nodepulse-agent.service
[Unit]
Description=NodePulse Telemetry Agent
After=network-online.target
Wants=network-online.target

[Service]
User=nodepulse
Group=nodepulse
ExecStart=/usr/local/bin/nodepulse-agent --config /etc/nodepulse/agent.yaml
Restart=always
RestartSec=5
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@privileged @resources @mount
CapabilityBoundingSet=
AmbientCapabilities=
ReadWritePaths=/var/log/nodepulse
UMask=0077

[Install]
WantedBy=multi-user.target
EOF

# 7. Reload and start systemd service
if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload
  systemctl enable --now nodepulse-agent
  echo "NodePulse Agent installed and started successfully!"
  systemctl status nodepulse-agent --no-pager || true
else
  echo "Warning: systemctl not found. Please manage /usr/local/bin/nodepulse-agent manually."
fi
