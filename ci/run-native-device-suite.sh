#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${NATIVE_REPORT_PATH:-}" ]]; then
  echo "NATIVE_REPORT_PATH is required; the native adapter result must be persisted." >&2
  exit 1
fi

mkdir -p "$(dirname "$NATIVE_REPORT_PATH")"

if [[ -z "${NATIVE_DEVICE_LAB_COMMAND:-}" ]]; then
  echo "NATIVE_DEVICE_LAB_COMMAND is required; configure the real iOS/Android device-lab adapter." >&2
  cat >"$NATIVE_REPORT_PATH" <<'JSON'
{"status":"blocked","reason":"NATIVE_DEVICE_LAB_COMMAND is not configured"}
JSON
  exit 0
fi

# The lab command is supplied by CI configuration, while the runner provides
# the selected target and the result contract through environment variables.
# Keep the adapter output visible in Actions logs, but also normalize the
# documented "last JSON object on stdout" fallback into NATIVE_REPORT_PATH.
stdout_path="$(mktemp)"
stderr_path="$(mktemp)"
cleanup() {
  rm -f "$stdout_path" "$stderr_path"
}
trap cleanup EXIT

# Provider/adapter output is allowed in the Actions log, but an adapter must
# never be able to echo its credential. Keep the raw stream for JSON parsing
# and redact only the copy written to the log. Buffering also lets the
# redactor handle a token split across output chunks without corrupting JSON.
redact_stream() {
  if [[ -z "${NATIVE_DEVICE_LAB_TOKEN:-}" ]]; then
    cat
    return
  fi

  NATIVE_DEVICE_LAB_TOKEN="$NATIVE_DEVICE_LAB_TOKEN" node -e '
const token = process.env.NATIVE_DEVICE_LAB_TOKEN;
const input = require("node:fs").readFileSync(0, "utf8");
process.stdout.write(input.split(token).join("[REDACTED]"));
'
}

set +e
sh -c "$NATIVE_DEVICE_LAB_COMMAND" \
  >"$stdout_path" 2>"$stderr_path"
adapter_exit_code="$?"
set -e

redact_stream <"$stdout_path"
redact_stream <"$stderr_path" >&2

if [[ ! -s "$NATIVE_REPORT_PATH" ]]; then
  node - "$stdout_path" "$NATIVE_REPORT_PATH" <<'NODE'
const { readFileSync, writeFileSync } = require("node:fs");

const [stdoutPath, reportPath] = process.argv.slice(2);
const lines = readFileSync(stdoutPath, "utf8").split(/\r?\n/);
const jsonLine = [...lines]
  .reverse()
  .map((line) => line.trim())
  .find((line) => line.startsWith("{") && line.endsWith("}"));

if (!jsonLine) process.exit(0);

try {
  const result = JSON.parse(jsonLine);
  writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
} catch {
  // The native checker will report the missing/invalid adapter result with
  // the full command output; do not turn arbitrary logs into a report.
}
NODE
fi

exit "$adapter_exit_code"
