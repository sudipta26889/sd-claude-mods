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
  "plugin list --json") sed 's/.*/{"id":"&"}/' "$STUB_LOG.inst" 2>/dev/null | paste -sd, - | sed 's/^/[/; s/$/]/' ;;
  "plugin install "*)
    id=${!#}; name=${id%@*}
    # As the real one behaves: sd-core is recorded even when one of its dependencies
    # can't be fetched, and then secret-guard is not turned on.
    grep -qx "$id" "$STUB_LOG.inst" 2>/dev/null || echo "$id" >> "$STUB_LOG.inst"
    for bad in ${STUB_FAIL:-}; do
      if [ "$name" = "$bad" ]; then
        grep -vx "$id" "$STUB_LOG.inst" > "$STUB_LOG.tmp" || true; mv "$STUB_LOG.tmp" "$STUB_LOG.inst"
        echo "stub: could not fetch $name" >&2; exit 1
      fi
      if [ "$name" = sd-core ] && grep -q "\"$bad\"" "$STUB_MANIFEST"; then
        echo "stub: could not fetch $bad" >&2; exit 1
      fi
    done
    if [ "$name" = sd-core ]; then touch "$STUB_LOG.guard"; fi
    ;;
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
export STUB_MANIFEST=$here/../plugins/sd-core/.claude-plugin/plugin.json
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
for mod in usage-meter agent-radar; do
  grep -q "plugin install $mod@sd-claude-mods" "$STUB_LOG" || fail "first run did not install $mod"
done
grep -q 'blast-radius' "$STUB_LOG" && fail "installed blast-radius, which is opt-in"
[[ "$out" == *"Done. Auto-update was set"* ]] || fail "full success did not say Done"

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
for tool in bash env git awk sort head touch sed paste grep rm mv tail; do ln -s "$(command -v "$tool")" "$tmp/nopy/$tool"; done
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

# A third-party mod that can't be fetched: the run goes on, secret-guard is on,
# and the last line names what failed instead of claiming success.
fresh() { rm -f "$settings" "$STUB_LOG".*; : > "$STUB_LOG"; }
last_line() { printf '%s\n' "$1" | tail -n 1; }

fresh
out=$(STUB_FAIL=usage-meter "$here/bootstrap.sh" 2>&1) || fail "a failed mod stopped the run"
[ -f "$STUB_LOG.guard" ] || fail "a failed mod left secret-guard off"
[[ "$out" == *"claude plugin install usage-meter@sd-claude-mods"* ]] || fail "no manual command for the failed mod"
grep -q 'plugin install agent-radar@sd-claude-mods' "$STUB_LOG" || fail "a failed mod stopped the next one"
[[ "$(last_line "$out")" == "Done, except"*usage-meter* ]] || fail "last line did not name the failed mod"
[[ "$(last_line "$out")" != *agent-radar* ]] || fail "last line named a mod that installed"
[[ "$out" != *"Done. "* ]] || fail "false success line"
grep -q PREFER_HTTPS "$settings" || fail "a failed mod skipped the settings step"

fresh
out=$(STUB_FAIL='usage-meter agent-radar' "$here/bootstrap.sh" 2>&1) || fail "two failed mods stopped the run"
[ -f "$STUB_LOG.guard" ] || fail "two failed mods left secret-guard off"
[[ "$(last_line "$out")" == *"usage-meter agent-radar"* ]] || fail "last line did not name both failed mods"
[[ "$out" != *"Done. "* ]] || fail "false success line with two failures"

# The retry adds only what is missing, then says Done.
: > "$STUB_LOG"
out=$("$here/bootstrap.sh" 2>&1) || fail "retry failed"
[ "$(grep -c 'plugin install' "$STUB_LOG")" = 2 ] || fail "retry did not install exactly the two missing mods"
[[ "$(last_line "$out")" == "Done. "* ]] || fail "retry did not report success"

# Failed mods under curl | bash, and without settings to write.
fresh
out=$(STUB_FAIL=agent-radar STUB_DRAIN=1 bash < "$here/bootstrap.sh" 2>&1) || fail "piped run stopped on a failed mod"
[[ "$(last_line "$out")" == *agent-radar* ]] || fail "piped run did not name the failed mod"
out=$(STUB_FAIL=agent-radar PATH=$tmp/nopy "$here/bootstrap.sh" 2>&1) || fail "failed mod without python3 stopped the run"
[[ "$(last_line "$out")" == *agent-radar* ]] || fail "without python3, last line did not name the failed mod"
[[ "$out" != *"Done, except auto-update"* ]] || fail "without python3, a failed mod still said Done"

# A computer from before these mods: sd-core is there and they are not.
fresh
touch "$STUB_LOG.added"; echo 'sd-core@sd-claude-mods' > "$STUB_LOG.inst"
"$here/bootstrap.sh" > /dev/null 2>&1 || fail "existing computer run failed"
[ "$(grep -c 'plugin install' "$STUB_LOG")" = 2 ] || fail "existing computer did not get exactly the two mods"
grep -q 'plugin install sd-core' "$STUB_LOG" && fail "existing computer reinstalled sd-core"

# sd-core must not depend on anything fetched from another repository.
python3 -I - "$STUB_MANIFEST" <<'PY' || fail "sd-core must hold only secret-guard"
import json, sys
assert json.load(open(sys.argv[1]))["dependencies"] == ["secret-guard"]
PY

# A truncated download must run nothing.
: > "$STUB_LOG"
lines=$(wc -l < "$here/bootstrap.sh")
head -n "$((lines / 2))" "$here/bootstrap.sh" | bash > /dev/null 2>&1 && fail "truncated script exited 0"
[ ! -s "$STUB_LOG" ] || fail "truncated script ran commands"

# CI runs this file, and plugin tests have no real processes to check a file mode with.
sh "$here/../plugins/handoff/tests/save.test.sh"

echo ok
