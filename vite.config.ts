import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import fs from "fs";

export default defineConfig({
	build: {
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (!id.includes("node_modules")) return;
					if (id.includes("katex")) return "vendor-katex";
					if (id.includes("highlight.js")) return "vendor-highlight";
					if (id.includes("marked") || id.includes("dompurify")) return "vendor-markdown";
					if (
						id.includes("xlsx") ||
						id.includes("pdf-parse") ||
						id.includes("mammoth") ||
						id.includes("jszip")
					) {
						return "vendor-doc-parsers";
					}
					return "vendor";
				}
			}
		}
	},
	plugins: [
		sveltekit(),
		{
			name: "patch-sveltekit-tsconfig",
			buildStart() {
				const p = ".svelte-kit/tsconfig.json";
				if (fs.existsSync(p)) {
					let c = fs.readFileSync(p, "utf8");
					c = c.replace(/"importsNotUsedAsValues":\s*"[^"]*",?\s*/g, "");
					c = c.replace(/"preserveValueImports":\s*true,?\s*/g, "");
					c = c.replace(/"ignoreDeprecations":\s*"[^"]*"/, '"ignoreDeprecations": "5.0"');
					fs.writeFileSync(p, c);
				}
			}
		}
	]
});
