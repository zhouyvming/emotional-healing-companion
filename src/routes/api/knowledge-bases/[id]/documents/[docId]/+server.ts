import { json } from "@sveltejs/kit";
import { pool } from "$lib/server/db";
import { requireAuth, AuthError } from "$lib/server/auth";
import type { RequestHandler } from "./$types";

export const DELETE: RequestHandler = async ({ params, request }) => {
	try {
		const auth = requireAuth(request);

		// 验证文档所属 KB 的用户
		const [docRows] = await pool.execute<any[]>(
			`SELECT d.id FROM kb_documents d
			 JOIN knowledge_bases k ON k.id = d.kb_id
			 WHERE d.id = ? AND d.kb_id = ? AND k.username = ?`,
			[params.docId, params.id, auth.username]
		);
		if (docRows.length === 0) {
			return json({ error: "文档不存在" }, { status: 404 });
		}

		await pool.execute("DELETE FROM kb_chunks WHERE doc_id = ?", [params.docId]);
		await pool.execute("DELETE FROM kb_documents WHERE id = ?", [params.docId]);

		return json({ success: true });
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: "删除失败" }, { status: 500 });
	}
};
