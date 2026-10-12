import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
	createClient,
	type ConfigPatch,
	type DoctorReport,
	type ProjectConfig,
	type Result,
	type StepInput,
	type Tag,
	type Theme,
	type WorkstateClient
} from '@workstate/client';

export interface RunIo {
	stdout: (s: string) => void;
	stderr: (s: string) => void;
	client?: WorkstateClient;
}

const USAGE = `usage:
  workstate start <title> [--summary s] [--state k] [--note n] [--step key=Title]... [--cwd dir]
  workstate step <taskId> <path> [state] [--title t] [--note n] [--tag text[|color]]... [--position n]
  workstate task <taskId> [state] [--title t] [--summary s] [--note n]
  workstate get <taskId>
  workstate config [--file path.json] [--theme t] [--color state=color]... [--initial state] [--task id] [--cwd dir]
  workstate url [taskId] [--cwd dir]
  workstate doctor [--cwd dir]`;

class UsageError extends Error {}

function parse<const O extends NonNullable<Parameters<typeof parseArgs>[0]>['options']>(
	args: string[],
	options: O,
	positionals: [min: number, max: number]
) {
	let parsed;
	try {
		parsed = parseArgs({ args, options, allowPositionals: true, strict: true });
	} catch (error) {
		throw new UsageError(error instanceof Error ? error.message : String(error));
	}
	const count = parsed.positionals.length;
	if (count < positionals[0] || count > positionals[1]) {
		throw new UsageError('wrong number of arguments');
	}
	return parsed as {
		values: { [K in keyof O]?: O[K] extends { multiple: true } ? string[] : string };
		positionals: string[];
	};
}

function splitPair(value: string, what: string): [string, string | undefined] {
	const at = value.indexOf('=');
	if (at < 0) return [value, undefined];
	if (at === 0) throw new UsageError(`bad ${what}: ${value}`);
	return [value.slice(0, at), value.slice(at + 1)];
}

function parseTag(value: string): Tag {
	const bar = value.indexOf('|');
	if (bar < 0) return { text: value };
	return { text: value.slice(0, bar), color: value.slice(bar + 1) };
}

function parseStep(value: string): StepInput {
	const [key, title] = splitPair(value, '--step');
	return title === undefined || title === '' ? { key } : { key, title };
}

function parseColor(value: string): NonNullable<ConfigPatch['states']>[number] {
	const [key, color] = splitPair(value, '--color');
	if (color === undefined || color === '')
		throw new UsageError(`--color needs state=color: ${value}`);
	return { key, color };
}

function formatDoctor(report: DoctorReport): string {
	const probes = report.probes.map(
		(p) => `  ${p.server} ${p.ok ? `ok${p.version ? ` (v${p.version})` : ''}` : 'unreachable'}`
	);
	return [
		`config dir: ${report.configDir}`,
		`pinned: ${report.pinned ?? 'none'}`,
		'probes:',
		...(probes.length ? probes : ['  none']),
		`server: ${report.server ?? 'none'}`,
		`repo: ${report.repoKey}`,
		`registered: ${report.registered ? `${report.registered.name} (${report.registered.projectId})` : 'no'}`,
		`registry: ${report.registryError ?? 'ok'}`
	].join('\n');
}

export async function run(argv: string[], io: RunIo): Promise<number> {
	const client = io.client ?? createClient();
	const [command, ...rest] = argv;

	const finish = <T>(result: Result<T>, print: (value: T) => string): number => {
		if (!result.ok) {
			io.stderr(`workstate: ${result.warning}`);
			return 0;
		}
		io.stdout(print(result.value));
		return 0;
	};

	try {
		switch (command) {
			case 'start': {
				const { values, positionals } = parse(
					rest,
					{
						summary: { type: 'string' },
						state: { type: 'string' },
						note: { type: 'string' },
						step: { type: 'string', multiple: true },
						cwd: { type: 'string' }
					},
					[1, 1]
				);
				const result = await client.startTask({
					title: positionals[0],
					summary: values.summary,
					state: values.state,
					note: values.note,
					steps: values.step?.map(parseStep),
					cwd: values.cwd
				});
				return finish(result, (v) => `${v.taskId} ${v.url}`);
			}
			case 'step': {
				const { values, positionals } = parse(
					rest,
					{
						title: { type: 'string' },
						note: { type: 'string' },
						tag: { type: 'string', multiple: true },
						position: { type: 'string' }
					},
					[2, 3]
				);
				const position = values.position === undefined ? undefined : Number(values.position);
				if (position !== undefined && !/^-?\d+$/.test(values.position!)) {
					throw new UsageError(`bad --position: ${values.position}`);
				}
				const result = await client.updateStep({
					taskId: positionals[0],
					path: positionals[1],
					state: positionals[2],
					title: values.title,
					note: values.note,
					tags: values.tag?.map(parseTag),
					position
				});
				return finish(result, (v) => `${v.node.path} ${v.node.state}`);
			}
			case 'task': {
				const { values, positionals } = parse(
					rest,
					{
						title: { type: 'string' },
						summary: { type: 'string' },
						note: { type: 'string' }
					},
					[1, 2]
				);
				const result = await client.updateTask({
					taskId: positionals[0],
					state: positionals[1],
					title: values.title,
					summary: values.summary,
					note: values.note
				});
				return finish(result, (v) => `${v.task.id} ${v.task.state}`);
			}
			case 'get': {
				const { positionals } = parse(rest, {}, [1, 1]);
				const result = await client.getTask({ taskId: positionals[0] });
				return finish(result, (v) => JSON.stringify(v));
			}
			case 'config': {
				const { values } = parse(
					rest,
					{
						file: { type: 'string' },
						theme: { type: 'string' },
						color: { type: 'string', multiple: true },
						initial: { type: 'string' },
						task: { type: 'string' },
						cwd: { type: 'string' }
					},
					[0, 0]
				);
				let config: ProjectConfig | undefined;
				if (values.file !== undefined) {
					try {
						config = JSON.parse(await readFile(values.file, 'utf8')) as ProjectConfig;
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						io.stderr(`workstate: cannot read config ${values.file}: ${message}`);
						return 2;
					}
				}
				const patch: ConfigPatch = {};
				if (values.theme !== undefined) patch.theme = values.theme as Theme;
				if (values.initial !== undefined) patch.initialState = values.initial;
				if (values.color?.length) patch.states = values.color.map(parseColor);
				const result = await client.configure({
					taskId: values.task,
					cwd: values.cwd,
					config,
					patch: Object.keys(patch).length ? patch : undefined
				});
				return finish(result, (v) => JSON.stringify(v.config));
			}
			case 'url': {
				const { values, positionals } = parse(rest, { cwd: { type: 'string' } }, [0, 1]);
				const result = await client.projectUrl({ taskId: positionals[0], cwd: values.cwd });
				return finish(result, (v) => v.url);
			}
			case 'doctor': {
				const { values } = parse(rest, { cwd: { type: 'string' } }, [0, 0]);
				io.stdout(formatDoctor(await client.doctor({ cwd: values.cwd })));
				return 0;
			}
			case '--help':
			case '-h':
			case 'help':
				io.stdout(USAGE);
				return 0;
			default:
				throw new UsageError(
					command === undefined ? 'missing command' : `unknown command: ${command}`
				);
		}
	} catch (error) {
		if (error instanceof UsageError) {
			io.stderr(`workstate: ${error.message}\n${USAGE}`);
			return 2;
		}
		io.stderr(`workstate: ${error instanceof Error ? error.message : String(error)}`);
		return 0;
	}
}
