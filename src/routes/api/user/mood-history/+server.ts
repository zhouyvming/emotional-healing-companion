import { json } from "@sveltejs/kit";
import { pool } from "$lib/server/db";
import { requireAuth, AuthError } from "$lib/server/auth";
import type { RowDataPacket } from "mysql2/promise";

interface MoodRow extends RowDataPacket {
	id: number;
	username: string;
	mood_date: string;
	mood: string;
	score: number;
}

export async function GET({ request }: { request: Request }) {
	try {
		const auth = requireAuth(request);
		const [rows] = await pool.query<MoodRow[]>(
			"SELECT mood_date, mood, score FROM mood_history WHERE username = ? ORDER BY mood_date DESC LIMIT 365",
			[auth.username]
		);
		return json(
			rows.map((r) => ({ date: r.mood_date, mood: r.mood, score: r.score }))
		);
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: "获取失败" }, { status: 500 });
	}
}

export async function POST({ request }: { request: Request }) {
	try {
		const auth = requireAuth(request);
		const { date, mood, score } = await request.json();

		if (!date || !mood || score === undefined) {
			return json({ error: "缺少必要信息" }, { status: 400 });
		}

		await pool.execute(
			"INSERT INTO mood_history (username, mood_date, mood, score) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE mood = VALUES(mood), score = VALUES(score)",
			[auth.username, date, mood, score]
		);

		return json({ success: true });
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: "保存失败" }, { status: 500 });
	}
}
