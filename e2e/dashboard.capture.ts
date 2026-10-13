import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { simulate } from '../scripts/simulate.mjs';

const server = `http://localhost:5191`;

function watch(page: Page) {
	return {
		cards: page.getByTestId('task-card'),
		connection: page.getByTestId('connection'),
		frame: page.getByTestId('page-frame'),
		row: (path: string) => page.locator(`[data-testid="node-row"][data-path="${path}"]`)
	};
}

async function openLive(page: Page, projectId: string) {
	await page.goto(`/p/${projectId}`);
	await expect(watch(page).connection).toContainText('Live');
}

test.describe('light', () => {
	test.use({ colorScheme: 'light' });

	test('dashboard run', async ({ page }, testInfo) => {
		const ui = watch(page);
		const run = simulate({
			server,
			speed: 2,
			onProject: (project) => openLive(page, project.id)
		});
		run.catch(() => {});

		await expect(ui.cards.first()).toContainText('Add rate limiting to the API');

		await expect(ui.row('chunk-1')).toHaveClass(/state-in_work/);
		await expect(ui.row('chunk-1')).toHaveClass(/state-done/);

		await expect(page.getByTestId('node-tag').filter({ hasText: 'round 2' }).first()).toBeVisible();

		const blocked = page.locator('[data-testid="task-card"].state-needs_input');
		await expect(blocked).toBeVisible();
		await page.waitForTimeout(700);
		await page.screenshot({
			path: testInfo.outputPath('dashboard.png'),
			animations: 'disabled'
		});

		await expect(page.locator('[data-testid="task-card"].flashing')).toBeVisible();

		await expect(page.locator('[data-testid="task-badge"].state-done').first()).toBeVisible({
			timeout: 40_000
		});
		await expect(page.locator('[data-testid="task-badge"].state-failed')).toBeVisible();

		await run;
		await expect(ui.frame).toHaveClass(/flashing/);
		await expect(ui.connection).toContainText('Live');
		await page.waitForTimeout(2500);
	});

	test('drill-in and timeline', async ({ browser }, testInfo) => {
		const { project, tasks } = await simulate({ server, speed: 8 });

		const { context, page } = await recordedPage(browser, testInfo);
		const ui = watch(page);
		await page.goto(`/p/${project.id}`);
		await expect(ui.connection).toContainText('Live');
		await page.waitForTimeout(1200);

		await page.getByTestId('task-badge').filter({ hasText: 'Add rate limiting' }).click();
		await expect(ui.cards.first()).toContainText('Add rate limiting to the API');
		await page.waitForTimeout(1000);

		await page.goto(`/p/${project.id}/t/${tasks.rateLimiting}`);
		await expect(ui.cards).toHaveCount(1);
		await expect(ui.row('chunk-1')).toHaveClass(/state-done/);
		await page.waitForTimeout(1200);

		await ui.row('chunk-1').getByTestId('node-title').click();
		const entries = ui.row('chunk-1').getByTestId('timeline-entry');
		await expect(entries.nth(3)).toBeVisible();
		expect(await entries.count()).toBeGreaterThan(3);
		await page.waitForTimeout(1800);

		await ui.row('chunk-3').getByTestId('node-title').click();
		await expect(ui.row('chunk-3').getByTestId('timeline-entry').nth(4)).toBeVisible();
		await page.waitForTimeout(1800);

		await ui.row('chunk-1').getByTestId('subtasks-toggle').click();
		await expect(ui.row('chunk-1/tests')).toBeVisible();
		await page.waitForTimeout(1800);

		await page.getByTestId('back-link').click();
		await expect(page.getByTestId('task-badge')).toHaveCount(3);
		await page.waitForTimeout(1500);

		await closeRecording(context, page, testInfo);
	});

	test('idle', async ({ page, request }) => {
		const created = await request.post('/api/projects', { data: { name: 'demo-repo' } });
		const { id, writeKey } = await created.json();
		const headers = { authorization: `Bearer ${writeKey}` };
		await request.post(`/api/projects/${id}/tasks`, {
			headers,
			data: {
				title: 'Add rate limiting to the API',
				summary: 'Token-bucket limiter per API key.',
				state: 'in_work',
				steps: [
					{
						key: 'chunk-1',
						title: 'Token bucket core',
						state: 'done',
						note: 'a1b2c3d Add token bucket'
					},
					{
						key: 'chunk-2',
						title: 'Apply limits to routes',
						state: 'in_work',
						note: 'wiring routes'
					},
					{ key: 'chunk-3', title: 'Rate limit headers', state: 'testing', note: 'review round 1' },
					{ key: 'chunk-4', title: 'Wire limiter into middleware' }
				]
			}
		});

		await openLive(page, id);
		await expect(page.getByTestId('idle-overlay')).toBeVisible({ timeout: 20_000 });
		await expect(watch(page).connection).toContainText('Idle');
		await page.waitForTimeout(1500);
	});
});

test.describe('dark', () => {
	test.use({ colorScheme: 'dark' });

	test('dashboard run, dark', async ({ page }) => {
		const ui = watch(page);
		const run = simulate({
			server,
			speed: 2,
			onProject: (project) => openLive(page, project.id)
		});
		run.catch(() => {});

		await expect(ui.cards.first()).toContainText('Add rate limiting to the API');
		await expect(page.locator('[data-testid="task-badge"].state-done').first()).toBeVisible({
			timeout: 40_000
		});
		await expect(page.locator('[data-testid="task-badge"].state-failed')).toBeVisible();

		await run;
		await expect(ui.frame).toHaveClass(/flashing/);
		await expect(ui.connection).toContainText('Live');
		await page.waitForTimeout(2500);
	});
});

async function recordedPage(browser: Browser, testInfo: TestInfo) {
	const context = await browser.newContext({
		baseURL: server,
		viewport: { width: 1280, height: 800 },
		colorScheme: 'light',
		recordVideo: { dir: testInfo.outputPath('recording'), size: { width: 1280, height: 800 } }
	});
	const page = await context.newPage();
	return { context, page };
}

async function closeRecording(
	context: Awaited<ReturnType<typeof recordedPage>>['context'],
	page: Page,
	testInfo: TestInfo
) {
	const video = page.video();
	await context.close();
	await video?.saveAs(testInfo.outputPath('video.webm'));
	await video?.delete();
}
