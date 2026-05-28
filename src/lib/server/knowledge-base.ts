import { v4 as uuidv4 } from "uuid";
import { pool } from "$lib/server/db";
import { OLLAMA_API_BASE_URL } from "$lib/constants";
import type { RowDataPacket } from "mysql2/promise";

interface ChunkRow extends RowDataPacket {
	id: string;
	doc_id: string;
	kb_id: string;
	content: string;
	chunk_index: number;
	embedding: string;
}

/**
 * 固定大小文本切片
 */
export function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
	const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
	if (!clean) return [];

	const chunks: string[] = [];
	let start = 0;
	while (start < clean.length) {
		let end = start + chunkSize;
		// 尝试在句号、换行处断开
		if (end < clean.length) {
			const breakAt = clean.lastIndexOf("。", end);
			const newlineAt = clean.lastIndexOf("\n", end);
			const best = Math.max(breakAt, newlineAt);
			if (best > start + chunkSize * 0.5) end = best + 1;
		}
		chunks.push(clean.slice(start, Math.min(end, clean.length)));
		start += chunkSize - overlap;
	}
	return chunks;
}

/**
 * 余弦相似度
 */
export function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0, normA = 0, normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	if (normA === 0 || normB === 0) return 0;
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 调用 Ollama 生成文本嵌入向量
 */
export async function getOllamaEmbedding(
	text: string,
	model = "nomic-embed-text",
	baseUrl?: string
): Promise<number[]> {
	const apiBase = (baseUrl || OLLAMA_API_BASE_URL).replace(/\/+$/, "");
	const res = await fetch(`${apiBase}/embeddings`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ model, prompt: text })
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(err.error || `Embedding API error: ${res.status}`);
	}
	const data = await res.json();
	return data.embedding;
}

/**
 * 处理文档：文本提取 → 切片 → 逐条 embed → 批量 INSERT
 * 复用 /api/parse-file 的解析管线
 */
export async function processDocument(
	kbId: string,
	docId: string,
	name: string,
	type: string,
	buffer: Buffer
): Promise<void> {
	// 更新状态为 processing
	await pool.execute(
		"UPDATE kb_documents SET status = 'processing' WHERE id = ?",
		[docId]
	);

	try {
		const text = await parseByExtension(name, type, buffer);
		if (!text.trim()) {
			await pool.execute(
				"UPDATE kb_documents SET status = 'error', error_message = ? WHERE id = ?",
				["未能从文件中提取文本内容", docId]
			);
			return;
		}

		// 获取 KB 配置的 chunk_size
		const [kbRows] = await pool.execute<RowDataPacket[]>(
			"SELECT chunk_size, embedding_model FROM knowledge_bases WHERE id = ?",
			[kbId]
		);
		const chunkSize = (kbRows[0] as any)?.chunk_size ?? 500;
		const embedModel = (kbRows[0] as any)?.embedding_model ?? "nomic-embed-text";

		const chunks = chunkText(text, chunkSize, Math.floor(chunkSize * 0.1));

		// 逐条 embedding 并插入
		const insertStmt =
			"INSERT INTO kb_chunks (id, doc_id, kb_id, content, chunk_index, embedding) VALUES (?, ?, ?, ?, ?, ?)";
		for (let i = 0; i < chunks.length; i++) {
			const embedding = await getOllamaEmbedding(chunks[i], embedModel);
			await pool.execute(insertStmt, [
				uuidv4(),
				docId,
				kbId,
				chunks[i],
				i,
				JSON.stringify(embedding)
			]);
		}

		await pool.execute(
			"UPDATE kb_documents SET status = 'done', chunk_count = ? WHERE id = ?",
			[chunks.length, docId]
		);
	} catch (error: any) {
		await pool.execute(
			"UPDATE kb_documents SET status = 'error', error_message = ? WHERE id = ?",
			[error.message || "处理失败", docId]
		);
	}
}

/**
 * 检索知识库：Embed 查询 → 余弦相似度 → Top-K
 */
export async function queryKnowledgeBase(
	kbId: string,
	query: string,
	k = 5,
	baseUrl?: string
): Promise<{ content: string; score: number }[]> {
	// 获取 KB 的 embedding 模型
	const [kbRows] = await pool.execute<RowDataPacket[]>(
		"SELECT embedding_model FROM knowledge_bases WHERE id = ?",
		[kbId]
	);
	const embedModel = (kbRows[0] as any)?.embedding_model ?? "nomic-embed-text";

	// 获取查询的 embedding
	const queryEmbedding = await getOllamaEmbedding(query, embedModel, baseUrl);

	// 加载该 KB 所有 chunks
	const [chunks] = await pool.execute<ChunkRow[]>(
		"SELECT id, content, embedding FROM kb_chunks WHERE kb_id = ?",
		[kbId]
	);

	if (chunks.length === 0) return [];

	// 计算相似度并排序
	const scored = chunks.map((c) => {
		const emb = typeof c.embedding === "string" ? JSON.parse(c.embedding) : c.embedding;
		return {
			content: c.content,
			score: cosineSimilarity(queryEmbedding, emb as number[])
		};
	});

	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, k);
}

/* ------------------------------------------------------------------ */
/* 文件解析（与 /api/parse-file 共享的实现）                           */
/* ------------------------------------------------------------------ */

const decodeXml = (value: string) =>
	value
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'");

const extname = (name: string) => name.toLowerCase().split(".").pop() ?? "";

async function parseDocx(buffer: Buffer) {
	const mammoth = await import("mammoth");
	const result = await mammoth.extractRawText({ buffer });
	return result.value;
}

async function parseDoc(buffer: Buffer) {
	const WordExtractorModule = await import("word-extractor");
	const WordExtractor = (WordExtractorModule.default ?? WordExtractorModule) as any;
	const extractor = new WordExtractor();
	const doc = await extractor.extract(buffer);
	return doc.getBody();
}

async function parsePdf(buffer: Buffer) {
	const pdfParseModule = await import("pdf-parse");
	const pdfParse = (pdfParseModule.default ?? pdfParseModule) as any;
	const result = await pdfParse(buffer);
	return result.text ?? "";
}

async function parseXlsx(buffer: Buffer) {
	const XLSX = await import("xlsx");
	const workbook = XLSX.read(buffer, { type: "buffer" });
	return workbook.SheetNames.map((sheetName) => {
		const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
		return `# ${sheetName}\n${csv}`;
	}).join("\n\n");
}

async function parsePptx(buffer: Buffer) {
	const JSZip = (await import("jszip")).default;
	const zip = await JSZip.loadAsync(buffer);
	const slideNames = Object.keys(zip.files)
		.filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
		.sort((a, b) => {
			const ai = Number(a.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
			const bi = Number(b.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
			return ai - bi;
		});

	const slides: string[] = [];
	for (const name of slideNames) {
		const xml = await zip.files[name].async("text");
		const texts = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)]
			.map((match) => decodeXml(match[1]).trim())
			.filter(Boolean);
		if (texts.length > 0) {
			slides.push(`## Slide ${slides.length + 1}\n${texts.join("\n")}`);
		}
	}
	return slides.join("\n\n");
}

export async function parseByExtension(name: string, type: string, buffer: Buffer) {
	const ext = extname(name);
	if (type.startsWith("text/") || ext === "txt" || ext === "md" || ext === "csv") {
		return buffer.toString("utf8");
	}
	if (ext === "docx") return parseDocx(buffer);
	if (ext === "doc") return parseDoc(buffer);
	if (ext === "pdf") return parsePdf(buffer);
	if (ext === "xlsx" || ext === "xls") return parseXlsx(buffer);
	if (ext === "pptx") return parsePptx(buffer);
	throw new Error("暂不支持解析该文件格式");
}
