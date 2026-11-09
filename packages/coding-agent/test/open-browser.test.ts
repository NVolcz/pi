import type * as ChildProcessModule from "node:child_process";
import { ChildProcess, spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { openBrowser } from "../src/utils/open-browser.ts";

vi.mock("node:child_process", async (importOriginal) => ({
	...(await importOriginal<typeof ChildProcessModule>()),
	spawn: vi.fn(),
}));

const projectDir = join(tmpdir(), "pi project # 日本語");
const projectUrl = pathToFileURL(`${projectDir}${sep}`);
const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
let child: ChildProcess;

function expectOpened(target: string): void {
	const [command, args] =
		process.platform === "darwin"
			? ["open", [target]]
			: process.platform === "win32"
				? ["rundll32", ["url.dll,FileProtocolHandler", target]]
				: ["xdg-open", [target]];
	expect(spawn).toHaveBeenCalledExactlyOnceWith(command, args, {
		stdio: "ignore",
		detached: true,
		cwd: "/",
	});
	expect(child.unref).toHaveBeenCalledExactlyOnceWith();
}

describe("openBrowser", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(process, "cwd").mockReturnValue(projectDir);
		child = new ChildProcess();
		vi.spyOn(child, "unref").mockImplementation(() => {});
		vi.mocked(spawn).mockReturnValue(child);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		Object.defineProperty(process, "platform", platformDescriptor);
	});

	// #10993: the opener must receive an absolute target even though its own cwd stays at / for WSL.
	test.each([
		["report.html", "report.html"],
		["./report.html", "report.html"],
		[".local/reports/report.html", ".local/reports/report.html"],
		["../report.html", "../report.html"],
		["docs/report with spaces.html", "docs/report%20with%20spaces.html"],
		["docs/説明.md", "docs/%E8%AA%AC%E6%98%8E.md"],
		["docs/%E8%AA%AC%E6%98%8E.md", "docs/%E8%AA%AC%E6%98%8E.md"],
		["docs/with%20spaces.html", "docs/with%20spaces.html"],
		["docs/with%23hash.html", "docs/with%23hash.html"],
		["docs/100%25.html", "docs/100%25.html"],
		["docs/report.html#section", "docs/report.html#section"],
		["docs/report.html?download=1#section", "docs/report.html?download=1#section"],
	])("resolves %s against pi's cwd", (target, expected) => {
		openBrowser(target);
		expectOpened(new URL(expected, projectUrl).href);
	});

	test.each([
		"https://example.com/auth?state=a%2Fb&redirect_uri=http%3A%2F%2Flocalhost%3A1234#fragment",
		"HTTP://Example.COM:80/a/../b",
		"mailto:hello@example.com",
		"vscode://file/tmp/report.ts:42",
		"file:///tmp/with%20spaces.html#section",
		"custom-app:open/report",
		"C:\\Users\\me\\report.html",
		"C:/Users/me/report.html",
	])("preserves the existing URL or drive target %s", (target) => {
		openBrowser(target);
		expectOpened(target);
	});

	test("preserves native absolute file paths", () => {
		const target = join(projectDir, "report with spaces #1.html");
		openBrowser(target);
		expectOpened(target);
	});

	test.each(["linux", "darwin", "win32"])("resolves local links before launching the %s opener", (platform) => {
		Object.defineProperty(process, "platform", { value: platform });
		openBrowser("./report.html");
		expectOpened(new URL("report.html", projectUrl).href);
	});

	test("handles opener launch failures without throwing", () => {
		openBrowser("https://example.com");
		expect(() => child.emit("error", new Error("opener not found"))).not.toThrow();
	});
});
