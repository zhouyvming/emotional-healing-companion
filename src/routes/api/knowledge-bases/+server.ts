import { json } from "@sveltejs/kit";
import { pool } from "$lib/server/db";
import { requireAuth, AuthError } from "$lib/server/auth";
import type { RowDataPacket } from "mysql2/promise";
import { v4 as uuidv4 } from "uuid";

interface KbRow extends RowDataPacket {
	id: string;
	username: string;
	name: string;
	embedding_model: string;
	chunk_size: number;
	created_at: string;
}

export async function GET({ request }: { request: Request }) {
	try {
		const auth = requireAuth(request);
		const [rows] = await pool.execute<KbRow[]>(
			"SELECT id, name, embedding_model, chunk_size, created_at FROM knowledge_bases WHERE username = ? ORDER BY created_at DESC",
			[auth.username]
		);
		return json(
			rows.map((r) => ({
				id: r.id,
				name: r.name,
				embedding_model: r.embedding_model,
				chunk_size: r.chunk_size,
				created_at: r.created_at
			}))
		);
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: "获取知识库列表失败" }, { status: 500 });
	}
}

export async function POST({ request }: { request: Request }) {
	try {
		const auth = requireAuth(request);
		const { name, chunk_size, embedding_model } = await request.json();

		if (!name || !name.trim()) {
			return json({ error: "请输入知识库名称" }, { status: 400 });
		}

		const id = uuidv4();
		await pool.execute(
			"INSERT INTO knowledge_bases (id, username, name, embedding_model, chunk_size) VALUES (?, ?, ?, ?, ?)",
			[
				id,
				auth.username,
				name.trim(),
				embedding_model || "nomic-embed-text",
				chunk_size || 500
			]
		);

		return json({ id, name: name.trim() });
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: "创建知识库失败" }, { status: 500 });
	}
}
