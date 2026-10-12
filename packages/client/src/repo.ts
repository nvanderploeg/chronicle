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
