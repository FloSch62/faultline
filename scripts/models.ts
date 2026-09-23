/** Builds the Blender device models into public/models, one Blender process per role.
 * Run: npm run models [-- router switch] [--render <dir>] [--azimuth 0,30] [--no-export]
 * Set BLENDER to the Blender executable (4.2 or newer) when it is not found automatically.
 * See blender/README.md for the model contract.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROLES = ["client", "router", "switch", "firewall", "honeypot", "cache", "power", "balancer"];

function findBlender(): string {
  if (process.env.BLENDER) return process.env.BLENDER;
  const installs = [
    "/mnt/c/Program Files/Blender Foundation", // Windows Blender seen from WSL
    "C:\\Program Files\\Blender Foundation",
  ].filter(existsSync);
  for (const folder of installs) {
    const newest = readdirSync(folder)
      .filter((name) => /^Blender \d/.test(name))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map((name) => path.join(folder, name, "blender.exe"))
      .find(existsSync);
    if (newest) return newest;
  }
  const mac = "/Applications/Blender.app/Contents/MacOS/Blender";
  return existsSync(mac) ? mac : "blender";
}

const blender = findBlender();
// A Windows Blender launched from WSL needs Windows paths.
const crossing = process.platform === "linux" && blender.endsWith(".exe");
const native = (file: string) => crossing ? execFileSync("wslpath", ["-w", path.resolve(file)]).toString().trim() : path.resolve(file);

const args = process.argv.slice(2);
const roles = args.filter((arg, index) => !arg.startsWith("--") && !args[index - 1]?.match(/^--(render|out|azimuth)$/));
const flags = args.filter((arg) => !roles.includes(arg)).map((arg, index, list) =>
  list[index - 1]?.match(/^--(render|out)$/) ? native(arg) : arg);
for (const role of roles)
  if (!ROLES.includes(role)) throw new Error(`Unknown role ${role}; expected one of ${ROLES.join(", ")}`);
const targets = roles.length ? roles : ROLES.filter((role) => existsSync(path.join(root, "blender", "devices", `${role}.py`)));

const build = (role: string) => new Promise<{ role: string; report: Record<string, unknown> | null; log: string }>((resolve) => {
  const child = spawn(blender, ["-b", "--factory-startup", "--python", native(path.join(root, "blender", "build.py")), "--", role, ...flags]);
  let log = "";
  child.stdout.on("data", (chunk) => (log += chunk));
  child.stderr.on("data", (chunk) => (log += chunk));
  child.on("error", (error) => resolve({ role, report: null, log: `${error.message}\nSet BLENDER to your Blender executable.` }));
  child.on("close", () => {
    const line = log.split(/\r?\n/).find((text) => text.startsWith("MODEL "));
    resolve({ role, report: line ? JSON.parse(line.slice(6)) : null, log });
  });
});

console.log(`Blender: ${blender}`);
let failed = false;
for (const { role, report, log } of await Promise.all(targets.map(build))) {
  if (!report) {
    failed = true;
    console.error(`✗ ${role}: build failed\n${log.split(/\r?\n/).filter((text) => /Error|Traceback|File "|^\s/.test(text)).slice(-25).join("\n")}`);
    continue;
  }
  const problems = report.problems as string[];
  failed ||= problems.length > 0;
  const size = report.bytes ? ` · ${Math.round(Number(report.bytes) / 1024)} KB` : "";
  console.log(`${problems.length ? "✗" : "✓"} ${role}: ${report.triangles} triangles · ${report.draw_calls} draw calls${size}`);
  for (const problem of problems) console.log(`    ${problem}`);
}
process.exit(failed ? 1 : 0);
