#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/desktop"
ELECTRON_BIN="$ROOT_DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
STATE_DIR="$ROOT_DIR/.local/run"
PID_FILE="$STATE_DIR/deeprunner.pid"

case "$(uname -m)" in
  arm64) MAC_OUTPUT_DIR="mac-arm64" ;;
  x86_64) MAC_OUTPUT_DIR="mac" ;;
  *)
    echo "DeepRunner: unsupported macOS architecture $(uname -m)." >&2
    exit 1
    ;;
esac

PACKAGED_APP="$APP_DIR/release/$MAC_OUTPUT_DIR/DeepRunner.app"
APP_BIN="$PACKAGED_APP/Contents/MacOS/DeepRunner"

stop_existing() {
  if [[ ! -f "$PID_FILE" ]]; then
    return
  fi
  local pid
  pid="$(<"$PID_FILE")"
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" >/dev/null 2>&1; then
    local command
    command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$command" == *"$ROOT_DIR"* ]]; then
      kill "$pid" >/dev/null 2>&1 || true
      for _ in {1..20}; do
        kill -0 "$pid" >/dev/null 2>&1 || break
        sleep 0.1
      done
    fi
  fi
  rm -f "$PID_FILE"
}

launch_background() {
  "$APP_BIN" &
  APP_PID=$!
  printf '%s\n' "$APP_PID" >"$PID_FILE"
}

cleanup() {
  if [[ -n "${APP_PID:-}" ]] && [[ -f "$PID_FILE" ]] && [[ "$(<"$PID_FILE")" == "$APP_PID" ]]; then
    rm -f "$PID_FILE"
  fi
}

stop_existing
cd "$ROOT_DIR"
corepack yarn build

if [[ ! -x "$ELECTRON_BIN" ]]; then
  echo "DeepRunner: Electron executable is missing; run 'corepack yarn install'." >&2
  exit 1
fi

# Launch the real app bundle so macOS uses DeepRunner's bundle name, identity,
# asset catalog, and icon instead of those belonging to Electron.app.
node "$APP_DIR/scripts/package-dir.mjs"
if [[ ! -x "$APP_BIN" ]]; then
  echo "DeepRunner: packaged executable is missing at $APP_BIN." >&2
  exit 1
fi

mkdir -p "$STATE_DIR" "$ROOT_DIR/.local/dsh-home"
export DSH_HOME="${DSH_HOME:-$ROOT_DIR/.local/dsh-home}"
export DEEPRUNNER_DEV="1"
trap cleanup EXIT

case "$MODE" in
  run)
    launch_background
    wait "$APP_PID"
    ;;
  --debug|debug)
    lldb -- "$APP_BIN"
    ;;
  --logs|logs)
    export ELECTRON_ENABLE_LOGGING=1
    launch_background
    wait "$APP_PID"
    ;;
  --telemetry|telemetry)
    launch_background
    /usr/bin/log stream --info --style compact --predicate 'process == "DeepRunner"'
    ;;
  --verify|verify)
    launch_background
    for _ in {1..50}; do
      if ! kill -0 "$APP_PID" >/dev/null 2>&1; then
        wait "$APP_PID"
        exit $?
      fi
      sleep 0.1
    done
    echo "DeepRunner: Electron process $APP_PID is running (DSH_HOME=$DSH_HOME)."
    ;;
  *)
    echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac
