import bcrypt from "bcryptjs";
import crypto from "crypto";

const SALT_ROUNDS = 10;
const SECRET = process.env.JWT_SECRET ?? "emotional-healing-companion-secret-key-change-in-production";

if (!process.env.JWT_SECRET) {
	console.warn("[安全] 使用默认 JWT secret，生产环境请设置 JWT_SECRET 环境变量");
}

// API Key 加密（AES-256-GCM，密钥派生自 JWT_SECRET）
function getCipherKey(): Buffer {
	return crypto.createHash("sha256").update(SECRET).digest();
}

export function encryptApiKey(plaintext: string): string {
	const key = getCipherKey();
	const iv = crypto.randomBytes(16);
	const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
	const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptApiKey(encoded: string): string {
	try {
		const key = getCipherKey();
		const buf = Buffer.from(encoded, "base64");
		const iv = buf.subarray(0, 16);
		const tag = buf.subarray(16, 32);
		const encrypted = buf.subarray(32);
		const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
		decipher.setAuthTag(tag);
		return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
	} catch {
		// 兼容旧数据：未被加密的旧 key 直接返回原文
		return encoded;
	}
}

export async function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	return bcrypt.compare(password, hash);
}

interface TokenPayload {
	userId: number | null;
	username: string;
	exp: number;
}

export function signToken(payload: { userId: number | null; username: string }): string {
	const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
	const body = Buffer.from(
		JSON.stringify({
			userId: payload.userId,
			username: payload.username,
			exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 // 7 days
		})
	).toString("base64url");

	const signature = crypto
		.createHmac("sha256", SECRET)
		.update(`${header}.${body}`)
		.digest("base64url");

	return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) return null;

		const [header, body, signature] = parts;

		const expectedSig = crypto
			.createHmac("sha256", SECRET)
			.update(`${header}.${body}`)
			.digest("base64url");

		if (signature !== expectedSig) return null;

		const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;

		if (payload.exp < Math.floor(Date.now() / 1000)) return null;

		return payload;
	} catch {
		return null;
	}
}

export function getTokenFromRequest(request: Request): string | null {
	const auth = request.headers.get("Authorization");
	if (!auth || !auth.startsWith("Bearer ")) return null;
	return auth.slice(7);
}

export function requireAuth(request: Request): TokenPayload {
	const token = getTokenFromRequest(request);
	if (!token) {
		throw new AuthError("未登录，请先登录");
	}
	const payload = verifyToken(token);
	if (!payload) {
		throw new AuthError("登录已过期，请重新登录");
	}
	return payload;
}

export class AuthError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AuthError";
	}
}
