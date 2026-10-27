#!/bin/sh
# Render one part to a PNG with headless Chrome.  tools/shot.sh <id> <out.png> [query] [px]
PX="${4:-1000}"
node /Users/aiden/.claude/skills/anatomy/scripts/capture.mjs "http://localhost:4173/shot.html?id=$1&px=$PX&$3" --out "$2" --width "$PX" --height "$PX" --scale 1 --wait 2000 --select canvas 2>&1 | grep -v '^saved' | grep -v 'console: clean' | grep -v '^clip' || true
