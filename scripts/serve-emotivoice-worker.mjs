import { spawn } from "node:child_process";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	symlinkSync,
	writeFileSync
} from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const modelRoot = join(root, "tools", "tts-models", "emotivoice");
const modelStore = join(modelRoot, "models");
const repo = join(modelRoot, "repo");
const upstreamApp = join(repo, "openaiapi.py");
const workerDir = join(root, "tools", "tts-worker");
const worker = join(workerDir, "server.py");

const upstreamHost = process.env.EMOTIVOICE_UPSTREAM_HOST || "127.0.0.1";
const upstreamPort = process.env.EMOTIVOICE_UPSTREAM_PORT || "8000";
const workerHost = process.env.EMOTIVOICE_WORKER_HOST || "127.0.0.1";
const workerPort = process.env.EMOTIVOICE_WORKER_PORT || "8510";
const upstreamUrl =
	process.env.EMOTIVOICE_UPSTREAM_URL || `http://${upstreamHost}:${upstreamPort}`;
const workerUrl = `http://${workerHost}:${workerPort}`;

const children = [];
let shuttingDown = false;
let blockedByPortConflict = false;

async function commandExists(command, args = ["--version"]) {
	return await new Promise((resolve) => {
		const child = spawn(command, args, { stdio: "ignore", shell: false });
		child.on("error", () => resolve(false));
		child.on("exit", (code) => resolve(code === 0));
	});
}

async function resolvePython() {
	if (process.env.PYTHON) return { command: process.env.PYTHON, moduleArgs: ["-m"] };
	if (await commandExists("python")) return { command: "python", moduleArgs: ["-m"] };
	if (await commandExists("python3")) return { command: "python3", moduleArgs: ["-m"] };
	if (process.platform === "win32" && (await commandExists("py", ["-3", "--version"]))) {
		return { command: "py", moduleArgs: ["-3", "-m"] };
	}
	throw new Error(
		"Python was not found. Install Python or set PYTHON to the full path of python.exe."
	);
}

function ensureEmotivoiceLinks() {
	mkdirSync(modelStore, { recursive: true });
	linkModelPath("outputs", join(modelStore, "outputs"), join(repo, "outputs"));
	linkModelPath("WangZeJun", join(modelStore, "WangZeJun"), join(repo, "WangZeJun"));
}

function linkModelPath(label, source, target) {
	if (existsSync(target)) return;
	if (!existsSync(source)) return;
	const type = process.platform === "win32" && lstatSync(source).isDirectory() ? "junction" : "dir";
	try {
		symlinkSync(source, target, type);
		console.log(`[tts:serve] Linked ${label}: ${target} -> ${source}`);
	} catch (error) {
		console.warn(`[tts:serve] Could not link ${label}: ${error.message}`);
	}
}

function checkRequiredFiles() {
	if (!existsSync(upstreamApp)) {
		throw new Error(`EmotiVoice source is missing: ${upstreamApp}\nRun: npm run tts:download`);
	}
	if (!existsSync(worker)) {
		throw new Error(`TTS worker file is missing: ${worker}`);
	}
	const outputsReady = existsSync(join(repo, "outputs")) || existsSync(join(modelStore, "outputs"));
	const bertReady =
		existsSync(join(repo, "WangZeJun", "simbert-base-chinese")) ||
		existsSync(join(modelStore, "WangZeJun", "simbert-base-chinese"));
	if (!outputsReady || !bertReady) {
		console.warn("[tts:serve] EmotiVoice model files look incomplete.");
		console.warn("[tts:serve] Run npm run tts:download again, or install them manually:");
		console.warn(
			`  git clone https://www.modelscope.cn/syq163/outputs.git "${join(modelStore, "outputs")}"`
		);
		console.warn(
			`  git clone https://www.modelscope.cn/syq163/WangZeJun.git "${join(
				modelStore,
				"WangZeJun"
			)}"`
		);
	}
}

function patchEmotivoiceRepo() {
	const openaiApi = join(repo, "openaiapi.py");
	const frontend = join(repo, "frontend.py");
	const frontendEn = join(repo, "frontend_en.py");
	if (existsSync(openaiApi)) {
		replaceInFile(
			openaiApi,
			"lexicon = read_lexicon(f\"{ROOT_DIR}/lexicon/librispeech-lexicon.txt\")\ng2p = G2p()",
			[
				"lexicon = read_lexicon(f\"{ROOT_DIR}/lexicon/librispeech-lexicon.txt\")",
				"# Lazily initialize English G2P only when English text appears.",
				"# This keeps Chinese-only local TTS startup from blocking on NLTK downloads.",
				"g2p = None"
			].join("\n")
		);
	}
	if (existsSync(frontend)) {
		replaceInFile(
			frontend,
			[
				"        elif re_english_word.match(part):",
				"            if chartype == 'cn':",
				"                if \"sp\" in tts_text[-1]:",
				"                    \"\"",
				"                else:",
				"                    tts_text.append('cn_eng_sp')",
				"            phoneme = get_eng_phoneme(part, g2p, lexicon, False).split()",
				"            if not phoneme :",
				"                # tts_text.pop()",
				"                continue",
				"            else:",
				"                chartype = 'en'"
			].join("\n"),
			[
				"        elif re_english_word.match(part):",
				"            # Project-local Chinese TTS mode: skip English/ASCII fragments so",
				"            # missing NLTK cmudict data cannot break Chinese message playback.",
				"            continue"
			].join("\n")
		);
	}
	if (existsSync(frontendEn)) {
		replaceInFile(
			frontendEn,
			"from g2p_en import G2p",
			[
				"class G2p:",
				"    def __init__(self, *args, **kwargs):",
				"        from g2p_en import G2p as RealG2p",
				"        self._impl = RealG2p(*args, **kwargs)",
				"",
				"    def __call__(self, *args, **kwargs):",
				"        return self._impl(*args, **kwargs)"
			].join("\n")
		);
		replaceInFile(
			frontendEn,
			"    filters = {\",\", \" \", \"'\"}",
			"    if g2p is None:\n        g2p = G2p()\n    filters = {\",\", \" \", \"'\"}"
		);
	}
}

function replaceInFile(file, from, to) {
	const current = readFileSync(file, "utf8");
	if (!current.includes(from)) return;
	writeFileSync(file, current.replace(from, to));
	console.log(`[tts:serve] Patched ${file}`);
}

async function isHttpReachable(url) {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 1500);
		const res = await fetch(url, { signal: controller.signal });
		clearTimeout(timeout);
		return res.status < 500;
	} catch {
		return false;
	}
}

async function isTcpOpen(host, port) {
	return await new Promise((resolve) => {
		const socket = net.createConnection({ host, port: Number(port) });
		socket.setTimeout(1200);
		socket.on("connect", () => {
			socket.destroy();
			resolve(true);
		});
		socket.on("timeout", () => {
			socket.destroy();
			resolve(false);
		});
		socket.on("error", () => resolve(false));
	});
}

function spawnPythonService(name, python, moduleArgs, args, options) {
	console.log(`[tts:serve] Starting ${name}: ${python} ${[...moduleArgs, ...args].join(" ")}`);
	const child = spawn(python, [...moduleArgs, ...args], {
		stdio: "inherit",
		...options,
		env: {
			...process.env,
			EMOTIVOICE_MODEL_ROOT: modelRoot,
			EMOTIVOICE_UPSTREAM_URL: upstreamUrl,
			...(options.env || {})
		}
	});
	children.push(child);

	child.on("error", (error) => {
		console.error(`[tts:serve] ${name} failed to start: ${error.message}`);
		console.error("[tts:serve] Install Python dependencies:");
		console.error("  python -m pip install -r tools/tts-worker/requirements.txt");
		console.error("  python -m pip install -r tools/tts-models/emotivoice/repo/requirements.txt");
		console.error("  python -m pip install -r tools/tts-models/emotivoice/repo/requirements.openaiapi.txt");
		shutdown(1);
	});

	child.on("exit", (code, signal) => {
		if (shuttingDown) return;
		if (code && code !== 0) {
			console.error(`[tts:serve] ${name} exited with code ${code}.`);
			console.error("[tts:serve] If this is a dependency error, run:");
			console.error("  python -m pip install -r tools/tts-worker/requirements.txt");
			console.error("  python -m pip install -r tools/tts-models/emotivoice/repo/requirements.txt");
			console.error("  python -m pip install -r tools/tts-models/emotivoice/repo/requirements.openaiapi.txt");
			shutdown(code);
			return;
		}
		console.log(`[tts:serve] ${name} stopped${signal ? ` (${signal})` : ""}.`);
		shutdown(code ?? 0);
	});

	return child;
}

function shutdown(code = 0) {
	shuttingDown = true;
	for (const child of children) {
		if (!child.killed) child.kill();
	}
	process.exitCode = code;
	setTimeout(() => process.exit(code), 100).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

checkRequiredFiles();
ensureEmotivoiceLinks();
patchEmotivoiceRepo();

const { command: python, moduleArgs } = await resolvePython();

const upstreamAlreadyRunning = await isHttpReachable(`${upstreamUrl}/docs`);
const upstreamPortInUse = upstreamAlreadyRunning || (await isTcpOpen(upstreamHost, upstreamPort));
const workerAlreadyRunning = await isHttpReachable(`${workerUrl}/health`);
const workerPortInUse = workerAlreadyRunning || (await isTcpOpen(workerHost, workerPort));

if (upstreamAlreadyRunning) {
	console.log(`[tts:serve] EmotiVoice upstream is already running at ${upstreamUrl}`);
} else if (upstreamPortInUse) {
	console.warn(`[tts:serve] Port ${upstreamPort} is already in use, but ${upstreamUrl}/docs did not respond.`);
	console.warn("[tts:serve] Stop the process using that port, or set EMOTIVOICE_UPSTREAM_PORT.");
	blockedByPortConflict = true;
} else {
	spawnPythonService(
		"EmotiVoice upstream",
		python,
		moduleArgs,
		["uvicorn", "openaiapi:app", "--host", upstreamHost, "--port", upstreamPort],
		{
			cwd: repo,
			env: {
				PYTHONPATH: repo
			}
		}
	);
}

if (workerAlreadyRunning) {
	console.log(`[tts:serve] Project TTS worker is already running at ${workerUrl}`);
} else if (workerPortInUse) {
	console.warn(`[tts:serve] Port ${workerPort} is already in use, but ${workerUrl}/health did not respond.`);
	console.warn("[tts:serve] Stop the stale worker process, or set EMOTIVOICE_WORKER_PORT and EMOTIVOICE_WORKER_URL.");
	blockedByPortConflict = true;
} else {
	spawnPythonService(
		"project TTS worker",
		python,
		moduleArgs,
		["uvicorn", "server:app", "--host", workerHost, "--port", workerPort],
		{
			cwd: workerDir,
			env: {
				PYTHONPATH: workerDir
			}
		}
	);
}

if (upstreamAlreadyRunning && workerAlreadyRunning) {
	console.log("[tts:serve] TTS services are already running.");
}

if (blockedByPortConflict) {
	shutdown(1);
}
