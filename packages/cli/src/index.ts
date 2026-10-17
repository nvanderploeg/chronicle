#!/usr/bin/env node
import { homedir } from 'node:os';

const argv = process.argv.slice(2);

if (argv[0] === 'hook') {
	const { handleHook, sessionsDir } = await import('./hook.ts');
	let raw = '';
	for await (const chunk of process.stdin) raw += chunk;
	const out = handleHook(raw, sessionsDir(process.env, homedir()));
	if (out) process.stdout.write(out + '\n');
} else {
	const { run } = await import('./run.ts');
	process.exitCode = await run(argv, {
		stdout: (s) => process.stdout.write(s + '\n'),
		stderr: (s) => process.stderr.write(s + '\n')
	});
}
