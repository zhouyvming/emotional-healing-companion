import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import fs from "fs";

export default defineConfig({
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
					c = c.replace(/"ignoreDeprecations":\s*"[^"]*"/, '"ignoreDeprecations": "6.0"');
					fs.writeFileSync(p, c);
				}
			}
		}
	]
});
