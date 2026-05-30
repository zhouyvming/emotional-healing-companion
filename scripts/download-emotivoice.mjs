import { existsSync, mkdirSync, symlinkSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const base = join(root, "tools", "tts-models", "emotivoice");
const repo = join(base, "repo");
const models = join(base, "models");
const outputs = join(models, "outputs");
const wangzejun = join(models, "WangZeJun");

mkdirSync(base, { recursive: true });
mkdirSync(models, { recursive: true });
writeFileSync(join(base, ".gitkeep"), "");

cloneIfMissing("EmotiVoice source", "https://github.com/netease-youdao/EmotiVoice.git", repo);
cloneIfMissing("EmotiVoice acoustic/vocoder models", "https://www.modelscope.cn/syq163/outputs.git", outputs);
cloneIfMissing("SimBERT model", "https://www.modelscope.cn/syq163/WangZeJun.git", wangzejun);

linkIfMissing("outputs", outputs, join(repo, "outputs"));
linkIfMissing("WangZeJun", wangzejun, join(repo, "WangZeJun"));
patchEmotivoiceRepo();

console.log(`
EmotiVoice source and model directories are ready.

Install Python dependencies if you have not done so:
  python -m pip install -r tools/tts-worker/requirements.txt
  python -m pip install -r tools/tts-models/emotivoice/repo/requirements.txt
  python -m pip install -r tools/tts-models/emotivoice/repo/requirements.openaiapi.txt

Then start the full local TTS chain:
  npm run tts:serve

The command starts both:
  - EmotiVoice upstream API: http://127.0.0.1:8000
  - Project TTS worker:      http://127.0.0.1:8510
`);

function cloneIfMissing(label, url, target) {
	if (existsSync(target)) {
		console.log(`[tts:download] ${label} already exists: ${target}`);
		return;
	}
	console.log(`[tts:download] Cloning ${label}...`);
	const result = spawnSync("git", ["clone", url, target], { stdio: "inherit" });
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

function linkIfMissing(label, source, target) {
	if (existsSync(target) || !existsSync(source)) return;
	const type = process.platform === "win32" && lstatSync(source).isDirectory() ? "junction" : "dir";
	try {
		symlinkSync(source, target, type);
		console.log(`[tts:download] Linked ${label}: ${target} -> ${source}`);
	} catch (error) {
		console.warn(`[tts:download] Could not link ${label}: ${error.message}`);
		console.warn(`[tts:download] You can manually copy ${source} to ${target}.`);
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
	console.log(`[tts:download] Patched ${file}`);
}
