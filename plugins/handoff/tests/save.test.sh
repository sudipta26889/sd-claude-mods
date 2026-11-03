#!/bin/sh
# Runs the real save script, because `claude plugin test` has no real processes.
set -eu
script="$(dirname "$0")/../hooks/save.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
dir="$work/handoffs"
file="$dir/project.md"

check() { [ -n "$(find "$1" -prune -perm "$2")" ] || { echo "FAIL: $1 is not mode $2"; exit 1; }; }

# A loose umask must not loosen the file or the folder.
umask 000
echo first | sh "$script" "$dir" "$file"
[ "$(cat "$file")" = first ] || { echo 'FAIL: text not saved'; exit 1; }
check "$file" 600
check "$dir" 700

# Saving again replaces the text and tightens a file someone loosened.
chmod 644 "$file"
echo second | sh "$script" "$dir" "$file"
[ "$(cat "$file")" = second ] || { echo 'FAIL: text not replaced'; exit 1; }
check "$file" 600

# A symlink at the target is replaced, and what it points at stays untouched.
echo outside > "$work/outside"
rm "$file"
ln -s "$work/outside" "$file"
echo third | sh "$script" "$dir" "$file"
[ "$(cat "$work/outside")" = outside ] || { echo 'FAIL: wrote through a symlink'; exit 1; }
[ ! -L "$file" ] || { echo 'FAIL: symlink kept'; exit 1; }

# A failure reports it and leaves no temporary file behind.
if echo fourth | sh "$script" "$work/outside/nope" "$file" 2>/dev/null; then
  echo 'FAIL: a bad folder reported success'
  exit 1
fi
[ -z "$(find "$dir" -name '.handoff.*')" ] || { echo 'FAIL: temporary file left'; exit 1; }

echo 'save.test.sh: ok'
