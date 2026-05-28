import toast from "svelte-french-toast";
import { authFetch } from "$lib/client/http";

export interface UploadingFile {
	name: string;
	data: string;
	type: string;
	text?: string;
	parseStatus?: "pending" | "done" | "error";
	parseError?: string;
}

export const isImageFile = (file: Pick<UploadingFile, "type">) => file.type.startsWith("image/");

export const isParseableDocument = (file: Pick<UploadingFile, "name" | "type">) => {
	const name = file.name.toLowerCase();
	return file.type.startsWith("text/") || /\.(txt|md|csv|docx|doc|pdf|xlsx|xls|pptx)$/i.test(name);
};

export async function parseUploadedFile(file: UploadingFile): Promise<UploadingFile> {
	if (isImageFile(file) || !isParseableDocument(file)) {
		return { ...file, parseStatus: "done" };
	}

	try {
		toast("正在解析文件内容");
		const res = await authFetch("/api/parse-file", {
			method: "POST",
			body: JSON.stringify({
				name: file.name,
				type: file.type,
				data: file.data
			})
		});

		const data = await res.json();
		if (!res.ok) {
			throw new Error(data.error || "解析文件失败");
		}

		toast.success("文件内容已解析");
		return { ...file, text: data.content, parseStatus: "done", parseError: undefined };
	} catch (error: any) {
		const message = error.message || "解析文件失败";
		toast.error(message);
		return { ...file, parseStatus: "error", parseError: message };
	}
}

export async function ensureFilesParsed(files: UploadingFile[]) {
	const parsed: UploadingFile[] = [];
	for (const file of files) {
		if (isImageFile(file) || file.text || file.parseStatus === "error") {
			parsed.push(file);
		} else {
			parsed.push(await parseUploadedFile({ ...file, parseStatus: "pending" }));
		}
	}
	return parsed;
}
