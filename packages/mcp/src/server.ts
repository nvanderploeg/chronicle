import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createClient, type Result, type WorkstateClient } from '@workstate/client';
import { z } from 'zod';

const tag = z.object({ text: z.string().min(1), color: z.string().optional() });

const step = z.object({
	key: z.string(),
	title: z.string().optional(),
	state: z.string().optional(),
	note: z.string().optional(),
	tags: z.array(tag).optional()
});

const stateDef = z.object({
	key: z.string(),
	label: z.string(),
	color: z.string(),
	kind: z.enum(['pending', 'active', 'blocked', 'failed', 'done']),
	icon: z.string().optional(),
	animation: z.enum(['none', 'pulse', 'shimmer', 'blink', 'spin']).optional()
});

const theme = z.enum(['system', 'light', 'dark']);

const projectConfig = z.object({
	theme,
	initialState: z.string(),
	states: z.array(stateDef)
});

const configPatch = z.object({
	theme: theme.optional(),
	initialState: z.string().optional(),
	states: z.array(stateDef.partial().extend({ key: z.string() })).optional()
});

function respond<T>(result: Result<T>): CallToolResult {
	const text = result.ok ? JSON.stringify(result.value) : `workstate: ${result.warning}`;
	return { content: [{ type: 'text', text }] };
}

export function createServer(client: WorkstateClient = createClient()): McpServer {
	const server = new McpServer({ name: 'workstate', version: '0.1.0' });

	server.registerTool(
		'start_task',
		{
			description:
				"Start tracking a multi-step task on this repo's workstate dashboard and return its url; print that url to the user as soon as work starts and try once to open it in their browser.",
			inputSchema: {
				title: z.string(),
				summary: z.string().optional(),
				state: z.string().optional(),
				note: z.string().optional(),
				steps: z.array(step).optional(),
				cwd: z.string().optional()
			}
		},
		async (args) => respond(await client.startTask(args))
	);

	server.registerTool(
		'update_step',
		{
			description:
				"Set a step's or subtask's state, note or tags by path (`step-1`, `step-1/tests`), creating it and any missing parents.",
			inputSchema: {
				taskId: z.string(),
				path: z.string(),
				title: z.string().optional(),
				state: z.string().optional(),
				note: z.string().optional(),
				tags: z.array(tag).optional(),
				position: z.number().int().optional()
			}
		},
		async (args) => respond(await client.updateStep(args))
	);

	server.registerTool(
		'update_task',
		{
			description:
				"Set the task's own state, title, summary or note; finish the task with a done, failed or needs_input state.",
			inputSchema: {
				taskId: z.string(),
				title: z.string().optional(),
				summary: z.string().optional(),
				state: z.string().optional(),
				note: z.string().optional()
			}
		},
		async (args) => respond(await client.updateTask(args))
	);

	server.registerTool(
		'get_task',
		{
			description:
				'Return the current task and its nodes; call this after context compaction to recover progress.',
			inputSchema: { taskId: z.string() }
		},
		async (args) => respond(await client.getTask(args))
	);

	server.registerTool(
		'configure',
		{
			description:
				"Read or change the project's states, colors and theme; `patch` merges states by key, `config` replaces the whole config.",
			inputSchema: {
				taskId: z.string().optional(),
				cwd: z.string().optional(),
				config: projectConfig.optional(),
				patch: configPatch.optional()
			}
		},
		async (args) => respond(await client.configure(args))
	);

	return server;
}
