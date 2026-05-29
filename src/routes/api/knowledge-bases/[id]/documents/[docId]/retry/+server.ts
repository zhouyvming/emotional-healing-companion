import { json } from "@sveltejs/kit";
import { pool } from "$lib/server/db";
import { requireAuth, AuthError } from "$lib/server/auth";
import { processDocument } from "$lib/server/knowledge-base";
import type { RowDataPacket } from "mysql2/promise";
import type { RequestHandler } from "./$types";

interface DocRow extends RowDataPacket {
	id: string;
	filename: string;
	source_type: string | null;
	source_data: string | null;
}

export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const auth = requireAuth(request);
		const [docRows] = await pool.execute<DocRow[]>(
			`SELECT d.id, d.filename, d.source_type, d.source_data
			 FROM kb_documents d
			 JOIN knowledge_bases k ON k.id = d.kb_id
			 WHERE d.id = ? AND d.kb_id = ? AND k.username = ?`,
			[params.docId, params.id, auth.username]
		);

		const doc = docRows[0];
		if (!doc) {
			return json({ error: "文档不存在" }, { status: 404 });
		}
		if (!doc.source_data) {
			return json({ error: "缺少原始文件数据，无法重试" }, { status: 409 });
		}

		await pool.execute(
			"UPDATE kb_documents SET status = 'pending', error_message = NULL, chunk_count = 0 WHERE id = ?",
			[params.docId]
		);

		const base64 = doc.source_data.includes(",") ? doc.source_data.split(",")[1] : doc.source_data;
		const buffer = Buffer.from(base64, "base64");
		processDocument(params.id, params.docId, doc.filename, doc.source_type || "", buffer).catch(
			(err) => console.error("[KB] document retry error:", err)
		);

		return json({ success: true });
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: "重新处理失败" }, { status: 500 });
	}
};
