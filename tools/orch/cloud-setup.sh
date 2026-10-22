#!/usr/bin/env bash
# cloud-setup.sh — make a fresh GPU-less cloud container able to run the gates.
# Idempotent; safe to re-run. Zero effect on the game. Run from the repo root.
#
#   - installs the playtest harness's dev dependency (playwright-core);
#   - points Playwright's default `channel: 'chrome'` at the preinstalled
#     Chromium when no system Chrome exists;
#   - provides /private/tmp for capture tools that default to macOS paths;
#   - exports the slow-host knobs (perf probe timeouts, harness wall-clock
#     slowdown, smaller smoke viewport) in the shell profile. SwiftShader boots
#     the shipped scene in ~15-30 s and renders ~1-2 fps at 1280x720 under load.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"

[ -d "$root/tools/playtest/node_modules/playwright-core" ] \
  || (cd "$root/tools/playtest" && npm install --no-audit --no-fund >/dev/null)

if [ ! -x /opt/google/chrome/chrome ] && [ -x /opt/pw-browsers/chromium ]; then
  mkdir -p /opt/google/chrome
  ln -sf "$(readlink -f /opt/pw-browsers/chromium)" /opt/google/chrome/chrome
fi

[ -e /private/tmp ] || { mkdir -p /private && ln -s /tmp /private/tmp; }

for f in "$HOME/.bashrc" "$HOME/.profile"; do
  grep -q 'HB_HARNESS_SLOWDOWN' "$f" 2>/dev/null && continue
  cat >> "$f" <<'ENV'
# hullbreaker: GPU-less host knobs (tools/orch/cloud-setup.sh)
export HB_PROBE_BOOT_MS=180000
export HB_PROBE_SPAWN_MS=300000
export HB_HARNESS_SLOWDOWN=40
export HB_SMOKE_VIEWPORT=480x300
ENV
done
echo "cloud-setup: ok (open a new shell or source ~/.bashrc for the env knobs)"
