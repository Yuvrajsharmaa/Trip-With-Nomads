import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const safeScript = fileURLToPath(new URL("./push_overrides_safe.mjs", import.meta.url));
const result = spawnSync(
  process.execPath,
  [safeScript, "--only=booking", "--include-booking", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: process.env,
  }
);

process.exit(result.status ?? 1);
