#!/usr/bin/env node
import { run } from './run.ts';

process.exitCode = await run(process.argv.slice(2), {
	stdout: (s) => process.stdout.write(s + '\n'),
	stderr: (s) => process.stderr.write(s + '\n')
});
