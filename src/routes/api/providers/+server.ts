import { json } from "@sveltejs/kit";
import { pool } from "$lib/server/db";
import { requireAuth, AuthError } from "$lib/server/auth";
import type { RowDataPacket } from "mysql2/promise";

interface ProviderRow extends RowDataPacket {
	id: string;
	username: string;
	name: string;
	base_url: string;
	api_key: string;
	models: string;
}

export async function GET({ request }) {
	try {
		const auth = requireAuth(request);
		const [rows] = await pool.query<ProviderRow[]>(
			"SELECT id, name, base_url, api_key, models FROM api_providers WHERE username = ?",
			[auth.username]
		);
		return json(
			rows.map((row) => ({
				id: row.id,
				name: row.name,
				baseUrl: row.base_url,
				apiKey: row.api_key,
				models: safeJsonParse(row.models)
			}))
		);
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		console.error("获取 API 提供商列表错误:", error);
		return json({ error: "获取失败" }, { status: 500 });
	}
}

export async function POST({ request }) {
	try {
		const auth = requireAuth(request);
		const { providers } = await request.json();

		const conn = await pool.getConnection();
		try {
			await conn.execute("DELETE FROM api_providers WHERE username = ?", [auth.username]);

			if (providers && Array.isArray(providers) && providers.length > 0) {
				for (const p of providers) {
					await conn.execute(
						"INSERT INTO api_providers (id, username, name, base_url, api_key, models) VALUES (?, ?, ?, ?, ?, ?)",
						[p.id, auth.username, p.name, p.baseUrl, p.apiKey, JSON.stringify(p.models ?? [])]
					);
				}
			}
		} finally {
			conn.release();
		}

		return json({ success: true });
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		console.error("保存 API 提供商错误:", error);
		return json({ error: "保存失败" }, { status: 500 });
	}
}

function safeJsonParse(val: string | object) {
	if (typeof val === "object") return val;
	try {
		return JSON.parse(val);
	} catch {
		return [];
	}
}
