import { pool } from "$lib/server/db";
import { decryptApiKey } from "$lib/server/auth";
import { safeJsonParse, isPrivateUrl } from "$lib/utils";
import type { RowDataPacket } from "mysql2/promise";

export interface ProviderModel {
	id: string;
	name: string;
}

export interface ServerProvider {
	id: string;
	name: string;
	baseUrl: string;
	apiKey: string;
	models: ProviderModel[];
}

interface ProviderRow extends RowDataPacket {
	id: string;
	name: string;
	base_url: string;
	api_key: string;
	models: string;
}

export function maskApiKey(apiKey: string) {
	if (!apiKey) return "";
	if (apiKey.length <= 8) return "********";
	return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

export function isMaskedApiKey(apiKey: unknown) {
	return typeof apiKey === "string" && (apiKey.includes("...") || /^\*+$/.test(apiKey));
}

export function normalizeProviderBaseUrl(baseUrl: string) {
	const url = new URL(baseUrl);
	if (!["https:", "http:"].includes(url.protocol)) {
		throw new Error("仅支持 HTTP/HTTPS API 地址");
	}
	if (isPrivateUrl(url.toString())) {
		throw new Error("不允许使用内网或本机地址作为第三方 API 地址");
	}
	return url.toString().replace(/\/+$/, "");
}

export async function getProviderForUser(
	username: string,
	providerId: string
): Promise<ServerProvider | null> {
	const [rows] = await pool.execute<ProviderRow[]>(
		"SELECT id, name, base_url, api_key, models FROM api_providers WHERE username = ? AND id = ?",
		[username, providerId]
	);
	const row = rows[0];
	if (!row) return null;
	return {
		id: row.id,
		name: row.name,
		baseUrl: normalizeProviderBaseUrl(row.base_url),
		apiKey: decryptApiKey(row.api_key),
		models: safeJsonParse<ProviderModel[]>(row.models, [])
	};
}

export function providerAllowsModel(provider: ServerProvider, model: string) {
	if (!provider.models.length) return true;
	return provider.models.some((m) => m.id === model || `${provider.name}/${m.id}` === model);
}
