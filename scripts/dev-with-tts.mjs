import { spawn } from "node:child_process";

const children = [
	spawn("npm.cmd", ["run", "tts:serve"], { stdio: "inherit", shell: false }),
	spawn("npm.cmd", ["run", "dev"], { stdio: "inherit", shell: false })
];

const stopAll = () => {
	for (const child of children) child.kill();
};

process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);

for (const child of children) {
	child.on("exit", (code) => {
		if (code && code !== 0) {
			stopAll();
			process.exit(code);
		}
	});
}
