import { spawn } from "node:child_process";
import { isAbsolute, sep } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Open a URL or file in the platform browser/default handler.
 *
 * This intentionally never invokes a shell. On Windows, do not use
 * `cmd /c start`: cmd.exe re-parses metacharacters (&, |, ^, ...) before
 * `start` runs, which would make attacker-controlled URLs injectable.
 */
export function openBrowser(target: string): void {
	if (!isAbsolute(target) && !URL.canParse(target)) {
		// The launcher uses / for WSL, so resolve relative links before handing them off.
		target = new URL(target, pathToFileURL(`${process.cwd()}${sep}`)).href;
	}

	const [cmd, args]: [string, string[]] =
		process.platform === "darwin"
			? ["open", [target]]
			: process.platform === "win32"
				? ["rundll32", ["url.dll,FileProtocolHandler", target]]
				: ["xdg-open", [target]];

	// spawn reports launcher failures (for example, missing xdg-open) via an
	// error event. Browser launch is best-effort: callers still present the target
	// to the user, so keep the launcher failure from becoming a process crash.
	// On WSL, xdg-open launches explorer.exe, which fails when the cwd's
	// \\wsl.localhost\... path exceeds MAX_PATH (#11592). The target is a URL,
	// so no launcher needs pi's cwd.
	spawn(cmd, args, { stdio: "ignore", detached: true, cwd: "/" })
		.on("error", () => {})
		.unref();
}
