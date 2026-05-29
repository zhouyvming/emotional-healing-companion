import assert from "node:assert/strict";
import test from "node:test";

function isPrivateUrl(urlString) {
	try {
		const u = new URL(urlString);
		const blocked = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "169.254.169.254"];
		if (blocked.includes(u.hostname)) return true;
		const blocks = [
			"10.",
			"172.16.",
			"172.17.",
			"172.18.",
			"172.19.",
			"172.20.",
			"172.21.",
			"172.22.",
			"172.23.",
			"172.24.",
			"172.25.",
			"172.26.",
			"172.27.",
			"172.28.",
			"172.29.",
			"172.30.",
			"172.31.",
			"192.168."
		];
		return blocks.some((block) => u.hostname.startsWith(block));
	} catch {
		return true;
	}
}

function chunkText(text, chunkSize = 500, overlap = 50) {
	const clean = text
		.replace(/\r\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
	if (!clean) return [];
	const chunks = [];
	let start = 0;
	while (start < clean.length) {
		const end = Math.min(start + chunkSize, clean.length);
		chunks.push(clean.slice(start, end));
		start += Math.max(1, chunkSize - overlap);
	}
	return chunks;
}

function safeJsonParse(val, fallback) {
	if (val == null) return fallback;
	if (typeof val === "object") return val;
	try {
		return JSON.parse(val);
	} catch {
		return fallback;
	}
}

test("private URL detection blocks local and RFC1918 ranges", () => {
	assert.equal(isPrivateUrl("http://localhost:11434"), true);
	assert.equal(isPrivateUrl("http://127.0.0.1:3000"), true);
	assert.equal(isPrivateUrl("http://192.168.1.10"), true);
	assert.equal(isPrivateUrl("https://api.example.com/v1"), false);
	assert.equal(isPrivateUrl("not a url"), true);
});

test("safeJsonParse returns fallback for invalid input", () => {
	assert.deepEqual(safeJsonParse('{"ok":true}', {}), { ok: true });
	assert.deepEqual(safeJsonParse("{bad", { ok: false }), { ok: false });
	assert.equal(safeJsonParse(null, "fallback"), "fallback");
});

test("chunkText produces overlapping chunks", () => {
	const chunks = chunkText("abcdefghijklmnopqrstuvwxyz", 10, 2);
	assert.deepEqual(chunks.slice(0, 3), ["abcdefghij", "ijklmnopqr", "qrstuvwxyz"]);
});
