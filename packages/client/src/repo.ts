import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

function gitCommonDir(cwd: string): Promise<string> {
	return new Promise((resolvePromise, reject) => {
		execFile(
			'git',
			['-C', cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
			{ timeout: 5000, encoding: 'utf8' },
			(error, stdout) => (error ? reject(error) : resolvePromise(stdout.trim()))
		);
	});
}

function git(cwd: string, args: string[]): Promise<string> {
	return new Promise((resolvePromise) => {
		execFile('git', ['-C', cwd, ...args], { timeout: 5000, encoding: 'utf8' }, (error, stdout) =>
			resolvePromise(error ? '' : stdout.trim())
		);
	});
}

// `owner/name` for a hosted remote, so a card names the repo the way its forge does.
export function repoFromRemote(remote: string): string | undefined {
	const match = /[:/]([^/:]+\/[^/]+?)(?:\.git)?\/?$/.exec(remote.trim());
	return match?.[1];
}

export async function gitRefs(cwd: string): Promise<{ repo?: string; branch?: string }> {
	const [remote, branch] = await Promise.all([
		git(cwd, ['remote', 'get-url', 'origin']),
		git(cwd, ['symbolic-ref', '--short', '-q', 'HEAD'])
	]);
	return {
		repo: remote ? repoFromRemote(remote) : undefined,
		branch: branch || undefined
	};
}

export async function repoIdentity(cwd: string): Promise<{ repoKey: string; name: string }> {
	try {
		const common = await gitCommonDir(cwd);
		if (!common) throw new Error('empty git-common-dir');
		const name = basename(common) === '.git' ? basename(dirname(common)) : basename(common);
		return { repoKey: common, name };
	} catch {
		const real = await realpath(cwd).catch(() => resolve(cwd));
		return { repoKey: real, name: basename(real) };
	}
}
