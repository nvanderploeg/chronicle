#!/usr/bin/env bash
set -euo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
RESULTS="$REPO/test-results"
OUT="$REPO/docs/captures"
FPS=${CAPTURE_FPS:-12}
WIDTH=${CAPTURE_WIDTH:-960}
MAX_BYTES=${CAPTURE_MAX_BYTES:-6291456}

command -v ffmpeg >/dev/null 2>&1 || { echo "captures: ffmpeg not found" >&2; exit 1; }

cd "$REPO"
pnpm e2e
mkdir -p "$OUT"

# gif <test-dir-suffix> <name> <trim-start-seconds>
gif() {
	local suffix=$1 name=$2 start=$3 video fps=$FPS width=$WIDTH
	video=$(find "$RESULTS" -path "*$suffix/video.webm" | head -n 1)
	[ -n "$video" ] || { echo "captures: no video for $suffix" >&2; exit 1; }
	local palette
	palette=$(mktemp --suffix=.png)
	while :; do
		local filters="fps=$fps,scale=$width:-1:flags=lanczos"
		ffmpeg -v error -y -ss "$start" -i "$video" -vf "$filters,palettegen=stats_mode=diff" "$palette"
		ffmpeg -v error -y -ss "$start" -i "$video" -i "$palette" \
			-lavfi "$filters [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=4" \
			-loop 0 "$OUT/$name.gif"
		[ "$(stat -c %s "$OUT/$name.gif")" -le "$MAX_BYTES" ] || [ "$fps" -le 6 ] && break
		fps=$((fps - 2))
		width=$((width * 85 / 100))
		echo "captures: $name over budget, retrying at ${fps}fps ${width}px" >&2
	done
	rm -f "$palette"
	printf '%-20s %s\n' "$name.gif" "$(du -h "$OUT/$name.gif" | cut -f1)"
}

gif light-dashboard-run dashboard-light 0.4
gif dark-dashboard-run-dark dashboard-dark 0.4
gif light-drill-in-and-timeline timeline 0
gif light-idle idle 0

still=$(find "$RESULTS" -path '*light-dashboard-run/dashboard.png' | head -n 1)
[ -n "$still" ] || { echo "captures: no dashboard.png still" >&2; exit 1; }
cp "$still" "$OUT/dashboard.png"
printf '%-20s %s\n' dashboard.png "$(du -h "$OUT/dashboard.png" | cut -f1)"
