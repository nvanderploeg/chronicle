#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const DEFAULT_SERVER = 'http://localhost:3280';

const USAGE = `Usage: node scripts/simulate.mjs [options]

Plays a build-it style run against a workstate server over its HTTP API.

  --server <url>     server to write to (default ${DEFAULT_SERVER})
  --speed <n>        divide every delay by n (default 1)
  --project <id>     report to an existing project (needs --key)
  --key <writeKey>   write key of --project
  --quiet            print only the dashboard URL
  -h, --help         show this help
`;

class SimulateError extends Error {}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tag = (text, color) => (color ? { text, color } : { text });
const SONNET = tag('sonnet', '#0ea5e9');
const OPUS = tag('opus', '#a855f7');

export async function simulate({
	server = DEFAULT_SERVER,
	speed = 1,
	projectId,
	writeKey,
	log = () => {},
	onProject
} = {}) {
	if (!(speed > 0)) throw new SimulateError('speed must be a positive number');
	if (Boolean(projectId) !== Boolean(writeKey)) {
		throw new SimulateError('projectId and writeKey go together');
	}
	const origin = server.trim().replace(/\/+$/, '');
	const t0 = Date.now();
	let beat = 0;

	const pause = (ms) => sleep((ms ?? 600 + ((beat++ * 337) % 600)) / speed);

	async function request(method, path, body, key) {
		const res = await fetch(origin + path, {
			method,
			headers: {
				...(body === undefined ? {} : { 'content-type': 'application/json' }),
				...(key ? { authorization: `Bearer ${key}` } : {})
			},
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		const text = await res.text();
		if (!res.ok) throw new SimulateError(`${method} ${path} -> ${res.status} ${text}`);
		return text ? JSON.parse(text) : {};
	}

	let project;
	if (projectId) {
		project = { id: projectId, writeKey, url: `${origin}/p/${projectId}` };
	} else {
		const made = await request('POST', '/api/projects', { name: 'demo-repo' });
		project = { id: made.id, writeKey: made.writeKey, url: made.url };
	}
	await onProject?.(project);
	await pause(1000);

	const stamp = () => `[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s]`;

	async function createTask(title, summary, steps) {
		const made = await request(
			'POST',
			`/api/projects/${project.id}/tasks`,
			{ title, summary, steps },
			project.writeKey
		);
		log(`${stamp()} task "${title}" created`);
		return made.taskId;
	}

	async function setTask(taskId, label, state, note) {
		await request('PATCH', `/api/tasks/${taskId}`, { state, note }, project.writeKey);
		log(`${stamp()} ${label} -> ${state}${note ? ` (${note})` : ''}`);
	}

	async function setStep(taskId, path, state, note, tags, title) {
		const encoded = path.split('/').map(encodeURIComponent).join('/');
		await request(
			'PUT',
			`/api/tasks/${taskId}/nodes/${encoded}`,
			{ state, note, ...(title ? { title } : {}), ...(tags ? { tags } : {}) },
			project.writeKey
		);
		log(`${stamp()} ${path} -> ${state}${note ? ` (${note})` : ''}`);
	}

	async function rateLimiting() {
		const id = await createTask(
			'Add rate limiting to the API',
			'Token-bucket limiter per API key, with 429 responses and headers.',
			[
				{ key: 'chunk-1', title: 'Token bucket core' },
				{ key: 'chunk-2', title: 'Apply limits to routes', tags: [tag('deps:chunk-1')] },
				{ key: 'chunk-3', title: 'Rate limit headers', tags: [tag('deps:chunk-1')] },
				{
					key: 'chunk-4',
					title: 'Wire limiter into middleware',
					tags: [tag('deps:chunk-2,chunk-3')]
				}
			]
		);
		await pause();
		await setTask(id, 'task', 'planning');
		await pause();

		await setStep(id, 'chunk-1', 'planning', 'prework', [SONNET]);
		await pause();
		await setStep(id, 'chunk-1', 'in_work', 'implementing', [
			tag('round 1'),
			SONNET,
			tag('serial')
		]);
		await setTask(id, 'task', 'in_work');
		await pause();
		await setStep(
			id,
			'chunk-1/tests',
			'in_work',
			'writing tests beside the work',
			undefined,
			'Tests'
		);
		await pause();
		await setStep(id, 'chunk-1/tests', 'testing', 'reconciling with the implementation');
		await pause();
		await setStep(id, 'chunk-1', 'testing', 'review round 1');
		await pause();
		await setStep(id, 'chunk-1/tests', 'done', 'green');
		await pause();
		await setStep(id, 'chunk-1', 'done', 'a1b2c3d Add token bucket');
		await pause();

		const routes = async () => {
			const tags = [tag('deps:chunk-1'), tag('round 1'), SONNET, tag('worktree')];
			await setStep(id, 'chunk-2', 'in_work', 'wiring routes', tags);
			await pause();
			await setStep(id, 'chunk-2/tests', 'in_work', 'route limit cases', undefined, 'Tests');
			await pause();
			await setStep(id, 'chunk-2/tests', 'testing');
			await pause();
			await setStep(id, 'chunk-2', 'testing', 'review round 1');
			await pause();
			const question = 'Limit per API key or per client IP? Behind a proxy the IP is shared.';
			await setStep(id, 'chunk-2', 'needs_input', question);
			await setTask(id, 'task', 'needs_input', question);
			await pause(3200);
			await setTask(id, 'task', 'in_work', 'answered: per API key');
			await setStep(id, 'chunk-2', 'in_work', 'answered: per API key', tags);
			await pause();
			await setStep(id, 'chunk-2', 'testing', 'review round 2');
			await setStep(id, 'chunk-2/tests', 'done', 'green');
			await pause();
			await setStep(id, 'chunk-2', 'done', 'd4e5f6a Apply limits to routes');
		};

		const headers = async () => {
			const tags = [tag('deps:chunk-1'), tag('round 1'), SONNET, tag('worktree')];
			await pause();
			await setStep(id, 'chunk-3', 'in_work', 'adding headers', tags);
			await pause();
			await setStep(id, 'chunk-3', 'testing', 'review round 1');
			await pause(1500);
			await setStep(id, 'chunk-3', 'in_work', 'structural finding: headers set after send', [
				tag('deps:chunk-1'),
				tag('round 2'),
				OPUS,
				tag('worktree')
			]);
			await pause();
			await setStep(id, 'chunk-3', 'testing', 'review round 2');
			await pause();
			await setStep(id, 'chunk-3', 'done', '9f8e7d6 Add rate limit headers');
		};

		await setStep(id, 'chunk-2', 'planning', 'prework', [tag('deps:chunk-1'), SONNET]);
		await pause();
		await Promise.all([routes(), headers()]);
		await pause();

		await setStep(id, 'chunk-4', 'in_work', 'wiring middleware', [
			tag('deps:chunk-2,chunk-3'),
			tag('round 1'),
			SONNET,
			tag('serial')
		]);
		await pause();
		await setStep(id, 'chunk-4', 'testing', 'review round 1');
		await pause();
		await setStep(id, 'chunk-4', 'done', 'b7c8d9e Wire limiter into middleware');
		await pause();

		await setTask(id, 'task', 'testing', 'full suite');
		await pause(1800);
		await setTask(id, 'task', 'done', 'https://github.com/example/demo-repo/pull/42');
		return id;
	}

	async function docs() {
		const id = await createTask('Update docs', 'Document the new limits in the README.', [
			{ key: 'readme', title: 'README section' },
			{ key: 'changelog', title: 'Changelog entry' }
		]);
		await pause();
		await setTask(id, 'docs', 'in_work');
		await setStep(id, 'readme', 'in_work', 'drafting', [SONNET]);
		await pause();
		await setStep(id, 'readme', 'done', 'e1f2a3b Document rate limits');
		await pause();
		await setStep(id, 'changelog', 'in_work', 'drafting', [SONNET]);
		await pause(1500);
		await setStep(id, 'changelog', 'failed', 'stashed as changelog-wip');
		await pause();
		await setTask(id, 'docs', 'failed', 'stashed as changelog-wip');
		return id;
	}

	async function flaky() {
		const id = await createTask('Fix flaky test', 'retry_after test fails one run in ten.', [
			{ key: 'reproduce', title: 'Reproduce' },
			{ key: 'fix', title: 'Fix' }
		]);
		await pause();
		await setTask(id, 'flaky', 'in_work');
		await setStep(id, 'reproduce', 'in_work');
		await pause();
		await setStep(id, 'reproduce', 'done', 'fails on a slow clock');
		await setStep(id, 'fix', 'in_work', 'inject the clock', [SONNET]);
		await pause();
		await setStep(id, 'fix', 'done', 'c9d8e7f Inject clock into limiter test');
		await pause();
		await setTask(id, 'flaky', 'done', 'c9d8e7f');
		return id;
	}

	const rateLimitingId = await rateLimiting();
	await pause();
	const docsRun = docs();
	await pause(2600);
	const [docsId, flakyId] = await Promise.all([docsRun, flaky()]);
	log(`${stamp()} finished`);
	return { project, tasks: { rateLimiting: rateLimitingId, docs: docsId, flaky: flakyId } };
}

async function main() {
	let args;
	try {
		args = parseArgs({
			options: {
				server: { type: 'string', default: DEFAULT_SERVER },
				speed: { type: 'string', default: '1' },
				project: { type: 'string' },
				key: { type: 'string' },
				quiet: { type: 'boolean', default: false },
				help: { type: 'boolean', short: 'h', default: false }
			}
		}).values;
	} catch (err) {
		process.stderr.write(`${err.message}\n\n${USAGE}`);
		return 2;
	}
	if (args.help) {
		process.stdout.write(USAGE);
		return 0;
	}
	try {
		await simulate({
			server: args.server,
			speed: Number(args.speed),
			projectId: args.project,
			writeKey: args.key,
			log: args.quiet ? undefined : (line) => console.log(line),
			onProject: (project) => console.log(`dashboard: ${project.url}`)
		});
		return 0;
	} catch (err) {
		process.stderr.write(`simulate: ${err instanceof Error ? err.message : err}\n`);
		return 1;
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	process.exitCode = await main();
}
