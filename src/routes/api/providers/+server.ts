import { json } from "@sveltejs/kit";
import { pool } from "$lib/server/db";
import { requireAuth, AuthError, encryptApiKey, decryptApiKey } from "$lib/server/auth";
import { safeJsonParse } from "$lib/utils";
import { maskApiKey, isMaskedApiKey, normalizeProviderBaseUrl } from "$lib/server/providers";
import type { RowDataPacket } from "mysql2/promise";

interface ProviderRow extends RowDataPacket {
	id: string;
	username: string;
	name: string;
	base_url: string;
	api_key: string;
	models: string;
}

export async function GET({ request }: { request: Request }) {
	try {
		const auth = requireAuth(request);
		const [rows] = await pool.query<ProviderRow[]>(
			"SELECT id, name, base_url, api_key, models FROM api_providers WHERE username = ?",
			[auth.username]
		);
		return json(
			rows.map((row) => {
				const apiKey = decryptApiKey(row.api_key);
				return {
					id: row.id,
					name: row.name,
					baseUrl: row.base_url,
					apiKey: maskApiKey(apiKey),
					hasApiKey: Boolean(apiKey),
					models: safeJsonParse(row.models, [])
				};
			})
		);
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		console.error("获取 API 提供商列表错误:", error);
		return json({ error: "获取失败" }, { status: 500 });
	}
}

export async function POST({ request }: { request: Request }) {
	try {
		const auth = requireAuth(request);
		const { providers } = await request.json();

		const conn = await pool.getConnection();
		try {
			const [existingRows] = await conn.query<ProviderRow[]>(
				"SELECT id, api_key FROM api_providers WHERE username = ?",
				[auth.username]
			);
			const existingKeys = new Map(existingRows.map((row) => [row.id, row.api_key]));

			await conn.beginTransaction();
			await conn.execute("DELETE FROM api_providers WHERE username = ?", [auth.username]);

			if (providers && Array.isArray(providers) && providers.length > 0) {
				for (const p of providers) {
					const name = String(p.name ?? "").trim();
					const baseUrl = normalizeProviderBaseUrl(String(p.baseUrl ?? "").trim());
					const rawApiKey = typeof p.apiKey === "string" ? p.apiKey.trim() : "";
					const storedApiKey =
						rawApiKey && !isMaskedApiKey(rawApiKey)
							? encryptApiKey(rawApiKey)
							: existingKeys.get(p.id);

					if (!p.id || !name || !baseUrl) {
						throw new Error("API 提供商信息不完整");
					}
					if (!storedApiKey) {
						throw new Error(`提供商 ${name} 缺少 API Key`);
					}

					await conn.execute(
						"INSERT INTO api_providers (id, username, name, base_url, api_key, models) VALUES (?, ?, ?, ?, ?, ?)",
						[p.id, auth.username, name, baseUrl, storedApiKey, JSON.stringify(p.models ?? [])]
					);
				}
			}
			await conn.commit();
		} catch (error) {
			await conn.rollback();
			throw error;
		} finally {
			conn.release();
		}

		return json({ success: true });
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		console.error("保存 API 提供商错误:", error);
		return json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 500 });
	}
}
