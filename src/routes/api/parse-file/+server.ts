import { json } from "@sveltejs/kit";
import { requireAuth, AuthError } from "$lib/server/auth";
import { parseByExtension } from "$lib/server/knowledge-base";

const MAX_TEXT_LENGTH = 120000;

const dataToBuffer = (data: string) => {
	const base64 = data.includes(",") ? data.split(",")[1] : data;
	return Buffer.from(base64, "base64");
};

const trimText = (text: string) => text.replace(/\r\n/g, "\n").trim().slice(0, MAX_TEXT_LENGTH);

export async function POST({ request }) {
	try {
		requireAuth(request);
		const { name, type = "", data } = await request.json();
		if (!name || !data) {
			return json({ error: "缺少文件信息" }, { status: 400 });
		}

		const buffer = dataToBuffer(data);
		const content = trimText(await parseByExtension(String(name), String(type), buffer));
		if (!content) {
			return json({ error: "未能从文件中提取文本内容" }, { status: 422 });
		}

		return json({ content });
	} catch (error: any) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: error.message || "解析文件失败" }, { status: 500 });
	}
}
