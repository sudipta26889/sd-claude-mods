#!/usr/bin/env bash
# Runs bootstrap.sh against a stub claude and a throwaway HOME. Touches nothing real.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/home/.claude"
settings=$tmp/home/.claude/settings.json

cat > "$tmp/bin/claude" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
case "$*" in
  --version) echo "${STUB_VERSION:-2.1.316} (Claude Code)" ;;
  "plugin marketplace list --json") [ -f "$STUB_LOG.added" ] && echo '[{"name":"sd-claude-mods"}]' || echo '[]' ;;
  "plugin marketplace add "*) touch "$STUB_LOG.added" ;;
  "plugin list --json") [ -f "$STUB_LOG.inst" ] && echo '[{"id":"sd-core@sd-claude-mods"}]' || echo '[]' ;;
  "plugin install "*) touch "$STUB_LOG.inst" ;;
esac
STUB
# Stands in for ssh so the test neither needs a network nor depends on a key.
cat > "$tmp/bin/ssh" <<'STUB'
#!/usr/bin/env bash
if [ -n "${STUB_SSH_OK:-}" ]; then echo "Hi! You've successfully authenticated"; exit 1; fi
echo "Permission denied"; exit 255
STUB
chmod +x "$tmp/bin/claude" "$tmp/bin/ssh"

export HOME=$tmp/home PATH=$tmp/bin:$PATH STUB_LOG=$tmp/log
unset CLAUDE_CONFIG_DIR CLAUDE_CODE_PLUGIN_PREFER_HTTPS
fail() { echo "FAIL: $*" >&2; exit 1; }

echo '{"theme":"dark","env":{"KEEP":"1"}}' > "$settings"
"$here/bootstrap.sh" > /dev/null
python3 -I - "$settings" <<'PY' || fail "settings merge"
import json, sys
s = json.load(open(sys.argv[1]))
assert s["theme"] == "dark" and s["env"]["KEEP"] == "1"
assert s["env"]["CLAUDE_CODE_PLUGIN_PREFER_HTTPS"] == "1"
e = s["extraKnownMarketplaces"]["sd-claude-mods"]
assert e["autoUpdate"] is True and e["source"]["repo"] == "sudipta26889/sd-claude-mods"
PY
grep -q 'plugin install sd-core@sd-claude-mods' "$STUB_LOG" || fail "first run did not install"

first=$(cat "$settings"); : > "$STUB_LOG"
"$here/bootstrap.sh" > /dev/null
[ "$first" = "$(cat "$settings")" ] || fail "second run changed settings"
grep -q 'marketplace add\|plugin install' "$STUB_LOG" && fail "second run added or installed again"

echo 'not json' > "$settings"
"$here/bootstrap.sh" > /dev/null 2>&1 || fail "invalid settings stopped the run"
[ "$(cat "$settings")" = 'not json' ] || fail "invalid settings were overwritten"

STUB_VERSION=2.1.9 "$here/bootstrap.sh" > /dev/null 2>&1 && fail "accepted an old claude"
STUB_VERSION=2.1.287 "$here/bootstrap.sh" > /dev/null 2>&1 || fail "refused the minimum claude"

rm "$settings"
STUB_SSH_OK=1 "$here/bootstrap.sh" > /dev/null
grep -q PREFER_HTTPS "$settings" && fail "forced HTTPS on a computer whose SSH key works"

echo ok
