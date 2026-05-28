import { json } from "@sveltejs/kit";
import { pool } from "$lib/server/db";
import { requireAuth, AuthError } from "$lib/server/auth";
import type { RowDataPacket } from "mysql2/promise";
import { v4 as uuidv4 } from "uuid";
import { processDocument } from "$lib/server/knowledge-base";
import type { RequestHandler } from "./$types";

interface DocRow extends RowDataPacket {
	id: string;
	kb_id: string;
	filename: string;
	status: string;
	chunk_count: number;
	error_message: string;
	created_at: string;
}

export const GET: RequestHandler = async ({ params, request }) => {
	try {
		const auth = requireAuth(request);

		// 验证 KB 属于该用户
		const [kbRows] = await pool.execute<RowDataPacket[]>(
			"SELECT id FROM knowledge_bases WHERE id = ? AND username = ?",
			[params.id, auth.username]
		);
		if (kbRows.length === 0) {
			return json({ error: "知识库不存在" }, { status: 404 });
		}

		const [rows] = await pool.execute<DocRow[]>(
			"SELECT id, filename, status, chunk_count, error_message, created_at FROM kb_documents WHERE kb_id = ? ORDER BY created_at DESC",
			[params.id]
		);
		return json(rows);
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: "获取文档列表失败" }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const auth = requireAuth(request);

		// 验证 KB 属于该用户
		const [kbRows] = await pool.execute<RowDataPacket[]>(
			"SELECT id FROM knowledge_bases WHERE id = ? AND username = ?",
			[params.id, auth.username]
		);
		if (kbRows.length === 0) {
			return json({ error: "知识库不存在" }, { status: 404 });
		}

		const { name, type, data } = await request.json();
		if (!name || !data) {
			return json({ error: "缺少文件信息" }, { status: 400 });
		}

		const docId = uuidv4();
		await pool.execute(
			"INSERT INTO kb_documents (id, kb_id, filename, status) VALUES (?, ?, ?, 'pending')",
			[docId, params.id, name]
		);

		// 解析 base64 → Buffer
		const base64 = data.includes(",") ? data.split(",")[1] : data;
		const buffer = Buffer.from(base64, "base64");

		// 异步处理文档（不阻塞响应）
		processDocument(params.id, docId, String(name), String(type || ""), buffer).catch(
			(err) => console.error("[KB] document processing error:", err)
		);

		return json({ id: docId, filename: name, status: "pending" });
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: "上传文档失败" }, { status: 500 });
	}
};
