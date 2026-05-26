import { json } from "@sveltejs/kit";
import { pool } from "$lib/server/db";
import { requireAuth, AuthError } from "$lib/server/auth";
import type { RowDataPacket } from "mysql2/promise";

interface UserRow extends RowDataPacket {
	settings: string | null;
}

export async function GET({ request }) {
	try {
		const auth = requireAuth(request);
		const [rows] = await pool.execute<UserRow[]>(
			"SELECT settings FROM users WHERE username = ?",
			[auth.username]
		);
		if (rows.length === 0) {
			return json({ error: "用户不存在" }, { status: 404 });
		}
		return json(safeJsonParse(rows[0].settings) ?? {});
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: "获取设置失败" }, { status: 500 });
	}
}

export async function PUT({ request }) {
	try {
		const auth = requireAuth(request);
		const { settings } = await request.json();

		await pool.execute("UPDATE users SET settings = ? WHERE username = ?", [
			JSON.stringify(settings),
			auth.username
		]);

		return json({ success: true });
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: "保存设置失败" }, { status: 500 });
	}
}

function safeJsonParse(val: string | object | null) {
	if (typeof val === "object") return val;
	try {
		return JSON.parse(val ?? "{}");
	} catch {
		return {};
	}
}
