/** Builds the Blender models into public/models, one Blender process per model.
 * Families: devices (public/models/<role>.glb), installations (public/models/installations/<kind>.glb)
 * and props (public/models/props/<name>.glb); names are unique across families.
 * Run: npm run models [-- router tap crate] [--render <dir>] [--azimuth 0,30] [--no-export]
 * Set BLENDER to the Blender executable (4.2 or newer) when it is not found automatically.
 * See blender/README.md for the model contract.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Keep in step with blender/build.py.
const FAMILIES: Record<string, { folder: string; names: string[] }> = {
  device: { folder: "devices", names: ["client", "router", "switch", "firewall", "honeypot", "cache", "power", "balancer", "rack", "phantom"] },
  installation: { folder: "installations", names: ["tap", "jammer", "spike", "anchor", "breaker"] },
  prop: { folder: "props", names: ["crate", "fragment"] },
};
const NAMES = Object.values(FAMILIES).flatMap((family) => family.names);
const scriptOf = (name: string) => {
  const family = Object.values(FAMILIES).find((entry) => entry.names.includes(name))!;
  return path.join(root, "blender", family.folder, `${name}.py`);
};

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
  if (!NAMES.includes(role)) throw new Error(`Unknown model ${role}; expected one of ${NAMES.join(", ")}`);
const targets = roles.length ? roles : NAMES.filter((name) => existsSync(scriptOf(name)));

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

/** Runs at most `limit` Blender processes at once, keeping the results in target order. */
async function pool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  }));
  return results;
}

console.log(`Blender: ${blender}`);
let failed = false;
for (const { role, report, log } of await pool(targets, 6, build)) {
  if (!report) {
    failed = true;
    console.error(`✗ ${role}: build failed\n${log.split(/\r?\n/).filter((text) => /Error|Traceback|File "|^\s/.test(text)).slice(-25).join("\n")}`);
    continue;
  }
  const problems = report.problems as string[];
  failed ||= problems.length > 0;
  const size = report.bytes ? ` · ${Math.round(Number(report.bytes) / 1024)} KB` : "";
  const family = report.family && report.family !== "device" ? ` (${report.family})` : "";
  console.log(`${problems.length ? "✗" : "✓"} ${role}${family}: ${report.triangles} triangles · ${report.draw_calls} draw calls${size}`);
  for (const problem of problems) console.log(`    ${problem}`);
  if (report.parts) console.log(`    parts: ${(report.parts as [string, number][]).map(([name, count]) => `${name} ${count}`).join(" · ")}`);
}
process.exit(failed ? 1 : 0);
