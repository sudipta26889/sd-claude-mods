#!/usr/bin/env bash
# New-computer setup. Safe to run again: each step checks before it changes.
set -euo pipefail

# Under curl | bash the script is every child's stdin, and a child that reads it
# would silently end the run. In a function, bash parses it all before running
# anything, which also means a truncated download runs nothing.
main() {

REPO=sudipta26889/sd-claude-mods
MARKETPLACE=sd-claude-mods
MIN_CLAUDE=2.1.287
CONFIG_DIR=${CLAUDE_CONFIG_DIR:-$HOME/.claude}

die() { echo "bootstrap: $*" >&2; exit 1; }

command -v git >/dev/null || die "git is required: install it, then run this again."
command -v claude >/dev/null || die "claude is required: see https://code.claude.com/docs"

version=$(claude --version | awk '{print $1}')
lowest=$(printf '%s\n%s\n' "$MIN_CLAUDE" "$version" | sort -t. -k1,1n -k2,2n -k3,3n | head -n1)
[ "$lowest" = "$MIN_CLAUDE" ] || die "claude $version is too old, $MIN_CLAUDE or newer is required: run 'claude update'."

# The repository is public, so no GitHub login is needed. Without a GitHub SSH
# key, plugin updates only work over HTTPS when this variable is set.
# (ssh -T exits 1 even when it authenticates, so read its words, not its status.)
ssh_works=0
case "$(ssh -n -o BatchMode=yes -o ConnectTimeout=5 -T git@github.com 2>&1 || true)" in
  *"successfully authenticated"*) ssh_works=1 ;;
  *) export CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1 ;;
esac

# Captured first: grep -q closing a pipe early can fail the pipeline under pipefail.
marketplaces=$(claude plugin marketplace list --json)
if [[ "$marketplaces" == *"\"$MARKETPLACE\""* ]]; then
  claude plugin marketplace update "$MARKETPLACE"
else
  claude plugin marketplace add "$REPO"
fi

installed=$(claude plugin list --json)
if [[ "$installed" != *"\"sd-core@$MARKETPLACE\""* ]]; then
  claude plugin install "sd-core@$MARKETPLACE"
fi

# Third-party mods come from other repositories, and that fetch can fail. They are
# not sd-core dependencies, so a failure here cannot turn secret-guard off. A mod
# that is already installed is left alone, even if it was disabled on purpose.
# blast-radius stays opt-in: under claude -p a risky command waits, which stalls bots.
failed=""
for mod in usage-meter agent-radar; do
  [[ "$installed" == *"\"$mod@$MARKETPLACE\""* ]] && continue
  if ! claude plugin install "$mod@$MARKETPLACE"; then
    echo "bootstrap: $mod did not install, so it is not active. To retry: claude plugin install $mod@$MARKETPLACE" >&2
    failed="$failed $mod"
  fi
done

# Auto-update has no CLI or marketplace.json switch, so set it where Claude Code
# looks first: autoUpdate on the extraKnownMarketplaces entry in settings.json.
manual="Turn on auto-update by hand: /plugin, Marketplaces, $MARKETPLACE, Enable auto-update."
auto_update=0
if command -v python3 >/dev/null; then
  if python3 -I - "$CONFIG_DIR/settings.json" "$MARKETPLACE" "$REPO" "$ssh_works" <<'PY'
import json, os, sys, tempfile

path, name, repo, ssh_works = sys.argv[1:]
path = os.path.realpath(path)  # a symlinked settings file stays a symlink
try:
    with open(path) as f:
        settings = json.load(f)
except FileNotFoundError:
    settings = {}
before = json.dumps(settings)

entry = settings.setdefault("extraKnownMarketplaces", {}).setdefault(
    name, {"source": {"source": "github", "repo": repo}}
)
entry["autoUpdate"] = True
if ssh_works != "1":
    settings.setdefault("env", {})["CLAUDE_CODE_PLUGIN_PREFER_HTTPS"] = "1"

if json.dumps(settings) != before:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
    with os.fdopen(fd, "w") as f:
        json.dump(settings, f, indent=2)
        f.write("\n")
    if os.path.exists(path):
        os.chmod(tmp, os.stat(path).st_mode & 0o777)
    os.replace(tmp, path)
PY
  then
    auto_update=1
  else
    echo "bootstrap: left settings.json alone." >&2
  fi
else
  echo "bootstrap: python3 not found, so settings.json was not changed." >&2
fi

claude plugin list
# With a failed mod, nothing above says Done: the last line says what is missing.
done_word="Done. "
done_except="Done, except auto-update. "
if [ -n "$failed" ]; then
  done_word=""
  done_except=""
fi
if [ "$auto_update" = 1 ]; then
  echo "${done_word}Auto-update was set in settings.json: confirm it under /plugin, Marketplaces."
else
  echo "$done_except$manual"
  if [ "$ssh_works" != 1 ]; then
    echo "No GitHub SSH key found, and this could not be saved: set CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1 in your shell profile, or plugin updates will fail."
  fi
fi
if [ -n "$failed" ]; then
  echo "Done, except these mods, which did not install:$failed. To retry, run this script again."
fi

}

main "$@"
