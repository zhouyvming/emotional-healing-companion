import { json } from "@sveltejs/kit";
import { requireAuth, AuthError } from "$lib/server/auth";

const MAX_TEXT_LENGTH = 120000;

const decodeXml = (value: string) =>
	value
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'");

const extname = (name: string) => name.toLowerCase().split(".").pop() ?? "";

const dataToBuffer = (data: string) => {
	const base64 = data.includes(",") ? data.split(",")[1] : data;
	return Buffer.from(base64, "base64");
};

const trimText = (text: string) => text.replace(/\r\n/g, "\n").trim().slice(0, MAX_TEXT_LENGTH);

async function parseDocx(buffer: Buffer) {
	const mammoth = await import("mammoth");
	const result = await mammoth.extractRawText({ buffer });
	return result.value;
}

async function parseDoc(buffer: Buffer) {
	const WordExtractorModule = await import("word-extractor");
	const WordExtractor = (WordExtractorModule.default ?? WordExtractorModule) as any;
	const extractor = new WordExtractor();
	const doc = await extractor.extract(buffer);
	return doc.getBody();
}

async function parsePdf(buffer: Buffer) {
	const pdfParseModule = await import("pdf-parse");
	const pdfParse = (pdfParseModule.default ?? pdfParseModule) as any;
	const result = await pdfParse(buffer);
	return result.text ?? "";
}

async function parseXlsx(buffer: Buffer) {
	const XLSX = await import("xlsx");
	const workbook = XLSX.read(buffer, { type: "buffer" });
	return workbook.SheetNames.map((sheetName) => {
		const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
		return `# ${sheetName}\n${csv}`;
	}).join("\n\n");
}

async function parsePptx(buffer: Buffer) {
	const JSZip = (await import("jszip")).default;
	const zip = await JSZip.loadAsync(buffer);
	const slideNames = Object.keys(zip.files)
		.filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
		.sort((a, b) => {
			const ai = Number(a.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
			const bi = Number(b.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
			return ai - bi;
		});

	const slides: string[] = [];
	for (const name of slideNames) {
		const xml = await zip.files[name].async("text");
		const texts = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)]
			.map((match) => decodeXml(match[1]).trim())
			.filter(Boolean);
		if (texts.length > 0) {
			slides.push(`## Slide ${slides.length + 1}\n${texts.join("\n")}`);
		}
	}
	return slides.join("\n\n");
}

async function parseByExtension(name: string, type: string, buffer: Buffer) {
	const ext = extname(name);
	if (type.startsWith("text/") || ext === "txt" || ext === "md" || ext === "csv") {
		return buffer.toString("utf8");
	}
	if (ext === "docx") return parseDocx(buffer);
	if (ext === "doc") return parseDoc(buffer);
	if (ext === "pdf") return parsePdf(buffer);
	if (ext === "xlsx" || ext === "xls") return parseXlsx(buffer);
	if (ext === "pptx") return parsePptx(buffer);
	throw new Error("暂不支持解析该文件格式");
}

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
