#!/bin/sh
# Saves stdin to $2 inside the private folder $1, as a file only the user can
# read. The temporary file is mode 600 from birth and mv replaces the target
# whole, so the text is never world-readable and a symlink there is not followed.
umask 077
mkdir -p "$1" || exit 1
tmp=$(mktemp "$1/.handoff.XXXXXX") || exit 1
cat > "$tmp" && mv -f "$tmp" "$2" || { rm -f "$tmp"; exit 1; }
