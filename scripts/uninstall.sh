#!/usr/bin/env bash
set -euo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
HELPER="$REPO/scripts/helper.mjs"
MCP_BIN="$REPO/packages/mcp/dist/index.js"
ALLOW_ENTRY='mcp__chronicle__*'
HOME_DIR=${HOME:?HOME must be set}
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME_DIR/.config}/chronicle"
MANIFEST="$CONFIG_DIR/install.json"

dry=0 purge=0

usage() {
	cat <<'USAGE'
Usage: scripts/uninstall.sh [options]

Removes what scripts/install.sh recorded in install.json for this checkout:
skill and CLI links that still point where install put them, MCP registrations
install added, and the tool allowlist entry install added.

  --purge      also delete projects.json and tasks.json (the project registry)
  --dry-run    print what would happen without changing anything
  -h, --help   show this help

Backups (*.bak-*) are listed, never restored or deleted.
USAGE
}

say() {
	if [ "$dry" = 1 ]; then
		case $1 in remove | mcp | allow | purge) set -- would "$1: $2" ;; esac
	fi
	printf '%-6s %s\n' "$1" "$2"
}
die() {
	say fail "$1" >&2
	exit 1
}

while [ $# -gt 0 ]; do
	case $1 in
		--purge) purge=1 ;;
		--dry-run) dry=1 ;;
		-h | --help)
			usage
			exit 0
			;;
		*)
			usage >&2
			die "unknown option: $1"
			;;
	esac
	shift
done

command -v node >/dev/null 2>&1 || die "node not found"

forget() {
	[ "$dry" = 1 ] || node "$HELPER" manifest-drop "$@"
}

report_backups() {
	local f
	for f in "$1".bak-*; do
		[ -e "$f" ] || [ -L "$f" ] || continue
		say backup "$f (left in place)"
	done
}

remove_link() {
	local path=$1 target=$2
	if [ ! -L "$path" ]; then
		if [ -e "$path" ]; then
			say keep "$path is no longer a symlink"
		else
			say ok "$path already gone"
		fi
		forget link "$REPO" "$path"
	elif [ "$(readlink "$path")" != "$target" ]; then
		say keep "$path no longer points to $target"
		forget link "$REPO" "$path"
	else
		[ "$dry" = 1 ] || rm "$path"
		say remove "$path"
		forget link "$REPO" "$path"
	fi
	report_backups "$path"
}

remove_claude_mcp() {
	if ! command -v claude >/dev/null 2>&1; then
		say keep "claude not on PATH; run 'claude mcp remove -s user chronicle' yourself"
		return
	fi
	local info
	if ! info=$(claude mcp get chronicle 2>&1); then
		say ok "claude MCP 'chronicle' already gone"
	elif [[ $info != *"$MCP_BIN"* ]]; then
		say keep "claude MCP 'chronicle' points elsewhere"
	elif [ "$dry" = 1 ]; then
		say mcp "run 'claude mcp remove -s user chronicle'"
	else
		claude mcp remove -s user chronicle >/dev/null
		say mcp "removed 'chronicle' from Claude Code"
	fi
	forget claude-mcp "$REPO" -
}

remove_codex_mcp() {
	local cfg=$1 result
	if [ "$dry" = 1 ]; then
		say mcp "remove [mcp_servers.chronicle] from $cfg"
		return
	fi
	result=$(node "$HELPER" codex-remove "$cfg" "$MCP_BIN")
	case $result in
		removed) say mcp "removed 'chronicle' from $cfg" ;;
		absent) say ok "codex MCP 'chronicle' already gone from $cfg" ;;
		*) say keep "codex 'chronicle' block in $cfg points elsewhere" ;;
	esac
	forget codex-mcp "$REPO" "$cfg"
}

remove_allow() {
	local settings=$1 result
	if [ "$dry" = 1 ]; then
		say allow "remove \"$ALLOW_ENTRY\" from $settings"
		return
	fi
	result=$(node "$HELPER" allow-remove "$settings" "$ALLOW_ENTRY")
	if [ "$result" = removed ]; then
		say allow "removed \"$ALLOW_ENTRY\" from $settings"
	else
		say ok "\"$ALLOW_ENTRY\" already absent from $settings"
	fi
	forget allow "$REPO" "$settings"
	report_backups "$settings"
}

if [ ! -f "$MANIFEST" ]; then
	say ok "nothing recorded at $MANIFEST"
else
	found=0
	# Read the manifest on fd 3: commands in the loop (claude mcp) would drain stdin.
	while IFS=$'\t' read -r -u 3 kind path target; do
		found=1
		case $kind in
			link) remove_link "$path" "$target" ;;
			claude-mcp) remove_claude_mcp ;;
			codex-mcp) remove_codex_mcp "$path" ;;
			allow) remove_allow "$path" ;;
			server)
				say note "tracker left running with its data; stop it with 'docker compose down' in $REPO"
				forget server "$REPO" -
				;;
		esac
	done 3< <(node "$HELPER" manifest-list "$REPO")
	[ "$found" = 1 ] || say ok "nothing recorded for $REPO in $MANIFEST"
fi

if [ "$purge" = 1 ]; then
	for f in projects.json tasks.json; do
		if [ -e "$CONFIG_DIR/$f" ]; then
			[ "$dry" = 1 ] || rm "$CONFIG_DIR/$f"
			say purge "$CONFIG_DIR/$f"
		fi
	done
fi
[ "$dry" = 1 ] || rmdir "$CONFIG_DIR" 2>/dev/null || true
say done "uninstall complete"
