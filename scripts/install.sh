#!/usr/bin/env bash
set -euo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
HELPER="$REPO/scripts/helper.mjs"
MCP_BIN="$REPO/packages/mcp/dist/index.js"
CLI_BIN="$REPO/packages/cli/dist/index.js"
ALLOW_ENTRY='mcp__chronicle__*'
HOME_DIR=${HOME:?HOME must be set}
CODEX_CONFIG="${CODEX_HOME:-$HOME_DIR/.codex}/config.toml"
PORT=${CHRONICLE_PORT:-3280}

replace=0 dry=0 with_server=0 allow_tools=0 skip_mcp=0
stamp=$(date +%Y%m%d%H%M%S)

usage() {
	cat <<'USAGE'
Usage: scripts/install.sh [options]

Installs the chronicle skills, MCP server registration and CLI from this checkout.
Safe to re-run; existing paths that are not ours are skipped.

  --replace       move conflicting paths aside to <name>.bak-<timestamp> and
                  re-register the MCP server instead of skipping
  --with-server   start the local tracker (docker compose up -d) and wait for it
  --allow-tools   add "mcp__chronicle__*" to permissions.allow in ~/.claude/settings.json
  --skip-mcp      do not register the MCP server with Claude Code or Codex
  --dry-run       print what would happen without changing anything
  -h, --help      show this help

Undo with scripts/uninstall.sh.
USAGE
}

say() {
	if [ "$dry" = 1 ]; then
		case $1 in link | move | mcp) return 0 ;; esac
	fi
	printf '%-5s %s\n' "$1" "$2"
}
die() {
	say fail "$1" >&2
	exit 1
}

while [ $# -gt 0 ]; do
	case $1 in
		--replace) replace=1 ;;
		--with-server) with_server=1 ;;
		--allow-tools) allow_tools=1 ;;
		--skip-mcp) skip_mcp=1 ;;
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

act() {
	if [ "$dry" = 1 ]; then
		say dry "$(printf '%q ' "$@")"
	else
		"$@"
	fi
}

record() {
	[ "$dry" = 1 ] || node "$HELPER" manifest-add "$@"
}

check_tools() {
	command -v node >/dev/null 2>&1 || die "node not found; install Node 22 or newer"
	local major
	major=$(node -p 'process.versions.node.split(".")[0]')
	[ "$major" -ge 22 ] || die "node $major found; need 22 or newer"
	if ! command -v pnpm >/dev/null 2>&1; then
		die "pnpm not found; run 'corepack enable' (ships with node) and retry"
	fi
	say ok "node $(node -v), pnpm $(pnpm -v)"
}

build() {
	if [ "$dry" = 1 ]; then
		say dry "pnpm install --frozen-lockfile && pnpm -r --filter './packages/*' build"
		return
	fi
	(cd "$REPO" && pnpm install --frozen-lockfile --silent && pnpm -r --filter './packages/*' build >/dev/null)
	chmod +x "$CLI_BIN" "$MCP_BIN"
	say ok "dependencies installed, packages built"
}

link_to() {
	local dest=$1 target=$2 label=$3
	if [ -L "$dest" ] && [ "$(readlink "$dest")" = "$target" ]; then
		say ok "$label already linked: $dest"
		return
	fi
	if [ -e "$dest" ] || [ -L "$dest" ]; then
		if [ "$replace" = 0 ]; then
			say skip "$label: $dest exists and is not ours (use --replace)"
			return
		fi
		act mv "$dest" "$dest.bak-$stamp"
		say move "$dest -> $dest.bak-$stamp"
	fi
	act mkdir -p "$(dirname "$dest")"
	act ln -s "$target" "$dest"
	record link "$REPO" "$dest" "$target"
	say link "$dest -> $target"
}

install_skills() {
	local dir name
	for dir in "$REPO"/skills/*/; do
		name=$(basename "$dir")
		link_to "$HOME_DIR/.agents/skills/$name" "$REPO/skills/$name" "skill $name (agents)"
		link_to "$HOME_DIR/.claude/skills/$name" "../../.agents/skills/$name" "skill $name (claude)"
	done
}

register_claude() {
	if ! command -v claude >/dev/null 2>&1; then
		say skip "claude not on PATH; MCP not registered with Claude Code"
		return
	fi
	if claude mcp get chronicle >/dev/null 2>&1; then
		if [ "$replace" = 0 ]; then
			say ok "claude MCP 'chronicle' already registered"
			return
		fi
		act claude mcp remove -s user chronicle
	fi
	act claude mcp add -s user chronicle -- node "$MCP_BIN"
	record claude-mcp "$REPO"
	say mcp "registered 'chronicle' with Claude Code"
}

register_codex() {
	if ! command -v codex >/dev/null 2>&1; then
		say skip "codex not on PATH; MCP not registered with Codex"
		return
	fi
	if [ -f "$CODEX_CONFIG" ] && grep -q '^\[mcp_servers\.chronicle\]' "$CODEX_CONFIG"; then
		if [ "$replace" = 0 ]; then
			say ok "codex MCP 'chronicle' already in $CODEX_CONFIG"
			return
		fi
		act node "$HELPER" codex-remove "$CODEX_CONFIG" -
	fi
	local arg=${MCP_BIN//\\/\\\\}
	arg=${arg//\"/\\\"}
	if [ "$dry" = 1 ]; then
		say dry "append [mcp_servers.chronicle] (node $MCP_BIN) to $CODEX_CONFIG"
		return
	fi
	mkdir -p "$(dirname "$CODEX_CONFIG")"
	{
		if [ -s "$CODEX_CONFIG" ]; then
			[ -z "$(tail -c1 "$CODEX_CONFIG")" ] || printf '\n'
			printf '\n'
		fi
		printf '[mcp_servers.chronicle]\ncommand = "node"\nargs = ["%s"]\n' "$arg"
	} >>"$CODEX_CONFIG"
	record codex-mcp "$REPO" "$CODEX_CONFIG"
	say mcp "registered 'chronicle' in $CODEX_CONFIG"
}

link_cli() {
	local bin_dir="$HOME_DIR/.local/bin"
	link_to "$bin_dir/chronicle" "$CLI_BIN" "cli"
	case ":$PATH:" in
		*":$bin_dir:"*) ;;
		*) say warn "$bin_dir is not on PATH; add it to your shell profile" ;;
	esac
}

compose() {
	if docker compose version >/dev/null 2>&1; then
		docker compose "$@"
	elif command -v docker-compose >/dev/null 2>&1; then
		docker-compose "$@"
	else
		return 127
	fi
}

start_server() {
	if [ "$dry" = 1 ]; then
		say dry "(cd $REPO && docker compose up -d), wait for http://localhost:$PORT/api/health"
		return
	fi
	command -v docker >/dev/null 2>&1 || {
		say warn "docker not found; tracker not started"
		return
	}
	if ! (cd "$REPO" && compose up -d); then
		say warn "docker compose failed; tracker not started"
		return
	fi
	local url="http://localhost:$PORT/api/health" i
	for i in $(seq 1 60); do
		if node -e 'fetch(process.argv[1],{signal:AbortSignal.timeout(2000)}).then(r=>r.json()).then(j=>process.exit(j.service==="chronicle"?0:1)).catch(()=>process.exit(1))' "$url"; then
			record server "$REPO"
			say ok "tracker healthy at http://localhost:$PORT"
			return
		fi
		sleep 2
	done
	say warn "tracker did not answer $url within 120s; check 'docker compose logs'"
}

allow_mcp_tools() {
	local settings="$HOME_DIR/.claude/settings.json"
	if [ "$dry" = 1 ]; then
		say dry "add \"$ALLOW_ENTRY\" to permissions.allow in $settings"
		return
	fi
	local result backup
	IFS=$'\t' read -r result backup < <(node "$HELPER" allow-add "$settings" "$ALLOW_ENTRY") ||
		die "could not update $settings"
	if [ "$result" = added ]; then
		record allow "$REPO" "$settings"
		[ "$backup" = - ] || say ok "backed up settings to $backup"
		say allow "added \"$ALLOW_ENTRY\" to $settings"
	else
		say ok "\"$ALLOW_ENTRY\" already allowed in $settings"
	fi
}

check_tools
build
install_skills
if [ "$skip_mcp" = 1 ]; then
	say skip "MCP registration (--skip-mcp)"
else
	register_claude
	register_codex
fi
link_cli
[ "$with_server" = 0 ] || start_server
[ "$allow_tools" = 0 ] || allow_mcp_tools
say done "chronicle installed from $REPO"
