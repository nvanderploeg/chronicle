#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const home = process.env.HOME;
const configDir = path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'workstate');
const manifestPath = path.join(configDir, 'install.json');

const [cmd, ...args] = process.argv.slice(2);
const none = (v) => (v === undefined || v === '-' ? undefined : v);

function timestamp() {
	const d = new Date();
	const p = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function readJson(file) {
	if (!fs.existsSync(file)) return undefined;
	const raw = fs.readFileSync(file, 'utf8');
	try {
		return { raw, value: JSON.parse(raw) };
	} catch {
		throw new Error(`${file} is not valid JSON`);
	}
}

function writeAtomic(file, text, mode) {
	fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
	const tmp = `${file}.tmp-${process.pid}`;
	fs.writeFileSync(tmp, text, { mode });
	fs.renameSync(tmp, file);
}

function loadManifest() {
	try {
		const parsed = readJson(manifestPath);
		return Array.isArray(parsed?.value?.entries) ? parsed.value.entries : [];
	} catch {
		throw new Error(`${manifestPath} is unreadable; fix or delete it`);
	}
}

function saveManifest(entries) {
	if (entries.length === 0) {
		fs.rmSync(manifestPath, { force: true });
		return;
	}
	writeAtomic(manifestPath, JSON.stringify({ version: 1, entries }, null, '\t') + '\n', 0o600);
}

function sameEntry(a, b) {
	return a.kind === b.kind && a.repo === b.repo && a.path === b.path;
}

function indentOf(raw) {
	return raw.match(/^([ \t]+)"/m)?.[1] ?? 2;
}

const commands = {
	'manifest-add'([kind, repo, p, target]) {
		const entry = { kind, repo };
		if (none(p)) entry.path = p;
		if (none(target)) entry.target = target;
		const entries = loadManifest().filter((e) => !sameEntry(e, entry));
		entries.push(entry);
		saveManifest(entries);
	},

	'manifest-list'([repo]) {
		for (const e of loadManifest()) {
			if (e.repo === repo) console.log([e.kind, e.path ?? '-', e.target ?? '-'].join('\t'));
		}
	},

	'manifest-drop'([kind, repo, p]) {
		const probe = { kind, repo, path: none(p) };
		saveManifest(loadManifest().filter((e) => !sameEntry(e, probe)));
	},

	'manifest-count'() {
		console.log(loadManifest().length);
	},

	'allow-add'([file, entry]) {
		const existing = readJson(file);
		const settings = existing?.value ?? {};
		const allow = (settings.permissions ??= {}).allow ?? [];
		if (allow.includes(entry)) return console.log('present\t-');
		let backup = '-';
		if (existing) {
			backup = `${file}.bak-${timestamp()}`;
			fs.copyFileSync(file, backup);
		}
		settings.permissions.allow = [...allow, entry];
		writeAtomic(
			file,
			JSON.stringify(settings, null, existing ? indentOf(existing.raw) : 2) + '\n',
			0o644
		);
		console.log(`added\t${backup}`);
	},

	'allow-remove'([file, entry]) {
		const existing = readJson(file);
		const allow = existing?.value.permissions?.allow;
		if (!Array.isArray(allow) || !allow.includes(entry)) return console.log('absent');
		const settings = existing.value;
		settings.permissions.allow = allow.filter((v) => v !== entry);
		if (settings.permissions.allow.length === 0) delete settings.permissions.allow;
		if (Object.keys(settings.permissions).length === 0) delete settings.permissions;
		writeAtomic(file, JSON.stringify(settings, null, indentOf(existing.raw)) + '\n', 0o644);
		console.log('removed');
	},

	'codex-remove'([file, needle]) {
		if (!fs.existsSync(file)) return console.log('absent');
		const lines = fs.readFileSync(file, 'utf8').split('\n');
		const isOurs = (l) => /^\[mcp_servers\.workstate(\..+)?\]\s*$/.test(l);
		const start = lines.findIndex(isOurs);
		if (start === -1) return console.log('absent');
		let end = start + 1;
		while (end < lines.length && (!/^\s*\[/.test(lines[end]) || isOurs(lines[end]))) end++;
		const block = lines.slice(start, end).join('\n');
		if (none(needle) && !block.includes(needle)) return console.log('foreign');
		let from = start;
		while (from > 0 && lines[from - 1].trim() === '') from--;
		const rest = lines.slice(end);
		const kept = [...lines.slice(0, from), ...(from > 0 && rest.length > 0 ? [''] : []), ...rest];
		fs.writeFileSync(file, kept.join('\n'));
		console.log('removed');
	}
};

try {
	if (!commands[cmd]) throw new Error(`unknown helper command: ${cmd}`);
	commands[cmd](args);
} catch (err) {
	console.error(`workstate-install: ${err.message}`);
	process.exit(1);
}
