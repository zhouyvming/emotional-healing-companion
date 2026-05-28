import { json } from "@sveltejs/kit";
import { pool } from "$lib/server/db";
import { requireAuth, AuthError } from "$lib/server/auth";
import { queryKnowledgeBase } from "$lib/server/knowledge-base";
import type { RowDataPacket } from "mysql2/promise";
import type { RequestHandler } from "./$types";

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

		const { query, k } = await request.json();
		if (!query || !query.trim()) {
			return json({ error: "请输入查询内容" }, { status: 400 });
		}

		const results = await queryKnowledgeBase(params.id, query.trim(), k || 5);
		return json({ results });
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: "检索失败" }, { status: 500 });
	}
};
