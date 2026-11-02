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
if [ -n "${STUB_DRAIN:-}" ]; then cat > /dev/null; fi
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
if [ -n "${STUB_DRAIN:-}" ]; then cat > /dev/null; fi
if [ -n "${STUB_SSH_OK:-}" ]; then echo "Hi! You've successfully authenticated"; exit 1; fi
echo "Permission denied"; exit 255
STUB
chmod +x "$tmp/bin/claude" "$tmp/bin/ssh"

export HOME=$tmp/home PATH=$tmp/bin:$PATH STUB_LOG=$tmp/log
unset CLAUDE_CONFIG_DIR CLAUDE_CODE_PLUGIN_PREFER_HTTPS
fail() { echo "FAIL: $*" >&2; exit 1; }

echo '{"theme":"dark","env":{"KEEP":"1"}}' > "$settings"
out=$("$here/bootstrap.sh" 2>&1)
[[ "$out" == *"Auto-update was set"* ]] || fail "success did not report auto-update"
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
out=$("$here/bootstrap.sh" 2>&1) || fail "invalid settings stopped the run"
[ "$(cat "$settings")" = 'not json' ] || fail "invalid settings were overwritten"
[[ "$out" != *"Auto-update was set"* ]] || fail "claimed auto-update with invalid settings"
[[ "$out" == *"Enable auto-update"* ]] || fail "gave no manual step with invalid settings"
[[ "$out" == *"CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1"* ]] || fail "no HTTPS step without an SSH key"
out=$(STUB_SSH_OK=1 "$here/bootstrap.sh" 2>&1)
[[ "$out" != *"CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1"* ]] || fail "HTTPS step shown despite a working SSH key"

# A PATH holding only what the script needs, so python3 is not found.
mkdir "$tmp/nopy"
for tool in bash env git awk sort head touch; do ln -s "$(command -v "$tool")" "$tmp/nopy/$tool"; done
ln -s "$tmp/bin/claude" "$tmp/bin/ssh" "$tmp/nopy/"
out=$(PATH=$tmp/nopy "$here/bootstrap.sh" 2>&1) || fail "missing python3 stopped the run"
[[ "$out" != *"Auto-update was set"* ]] || fail "claimed auto-update without python3"
[[ "$out" == *"Enable auto-update"* ]] || fail "gave no manual step without python3"
[[ "$out" == *"CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1"* ]] || fail "no HTTPS step without python3"

STUB_VERSION=2.1.9 "$here/bootstrap.sh" > /dev/null 2>&1 && fail "accepted an old claude"
STUB_VERSION=2.1.287 "$here/bootstrap.sh" > /dev/null 2>&1 || fail "refused the minimum claude"

rm "$settings"
STUB_SSH_OK=1 "$here/bootstrap.sh" > /dev/null
grep -q PREFER_HTTPS "$settings" && fail "forced HTTPS on a computer whose SSH key works"

# curl | bash: children inherit the script as stdin, and may read it.
rm "$settings"
out=$(STUB_DRAIN=1 STUB_SSH_OK=1 bash < "$here/bootstrap.sh" 2>&1) || fail "piped run failed"
[[ "$out" == *"Auto-update was set"* ]] || fail "piped run stopped early"

# A truncated download must run nothing.
: > "$STUB_LOG"
lines=$(wc -l < "$here/bootstrap.sh")
head -n "$((lines / 2))" "$here/bootstrap.sh" | bash > /dev/null 2>&1 && fail "truncated script exited 0"
[ ! -s "$STUB_LOG" ] || fail "truncated script ran commands"

echo ok
