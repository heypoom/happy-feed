#!/bin/sh
# Stands in for the cf CLI in cf-store.test.ts. FAKE_CF_HANGS is how many calls hang before one answers.
count_file="$FAKE_CF_DIR/calls"
calls=$(($(cat "$count_file" 2>/dev/null || echo 0) + 1))
echo "$calls" > "$count_file"
[ "$calls" -le "${FAKE_CF_HANGS:-0}" ] && exec sleep 600
echo '{"ok":true}'
