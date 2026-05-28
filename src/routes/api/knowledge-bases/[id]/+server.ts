import { json } from "@sveltejs/kit";
import { pool } from "$lib/server/db";
import { requireAuth, AuthError } from "$lib/server/auth";
import type { RequestHandler } from "./$types";

export const DELETE: RequestHandler = async ({ params, request }) => {
	try {
		const auth = requireAuth(request);

		// 验证 KB 属于该用户
		const [rows] = await pool.execute<any[]>(
			"SELECT id FROM knowledge_bases WHERE id = ? AND username = ?",
			[params.id, auth.username]
		);
		if (rows.length === 0) {
			return json({ error: "知识库不存在" }, { status: 404 });
		}

		// 级联删除：chunks → documents → knowledge_base
		await pool.execute("DELETE FROM kb_chunks WHERE kb_id = ?", [params.id]);
		await pool.execute("DELETE FROM kb_documents WHERE kb_id = ?", [params.id]);
		await pool.execute("DELETE FROM knowledge_bases WHERE id = ?", [params.id]);

		return json({ success: true });
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: "删除失败" }, { status: 500 });
	}
};
