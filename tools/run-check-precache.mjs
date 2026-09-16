import { spawnSync } from "node:child_process";

function parseCommandSpecs(specs) {
  return specs
    .split(";")
    .map((spec) => spec.trim())
    .filter(Boolean)
    .map((spec) => {
      const [command, ...args] = spec.split(/\s+/);
      return [command, [...args, "tools/check_precache.py"]];
    });
}

const commands = process.env.KMG_PYTHON_COMMANDS
  ? parseCommandSpecs(process.env.KMG_PYTHON_COMMANDS)
  : [
      ["python3", ["tools/check_precache.py"]],
      ["python", ["tools/check_precache.py"]],
      ["py", ["-3", "tools/check_precache.py"]],
    ];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: "inherit" });

  if (result.error && result.error.code === "ENOENT") {
    continue;
  }

  process.exit(result.status ?? 1);
}

console.error("Unable to find Python to run tools/check_precache.py.");
process.exit(1);
