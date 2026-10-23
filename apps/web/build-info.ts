import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SHORT = 7;

function gitHash(): string {
	const fromEnv = process.env.GIT_COMMIT?.trim();
	if (fromEnv) return fromEnv.slice(0, SHORT);
	try {
		return execFileSync('git', ['rev-parse', `--short=${SHORT}`, 'HEAD'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	} catch {
		return 'unknown';
	}
}

/** Compile-time constants for `define`; the version is apps/web/package.json's. */
export function buildInfo(): Record<string, string> {
	const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
	return {
		__APP_VERSION__: JSON.stringify(pkg.version),
		__GIT_HASH__: JSON.stringify(gitHash())
	};
}
