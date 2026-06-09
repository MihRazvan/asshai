import { execFileSync } from "node:child_process";

const paths = ["frontend/app", "frontend/components/ui", "frontend/components/ai-elements"];
const patterns = ["React\\.ComponentProps", "React\\.ReactNode", "React\\.CSSProperties"];

let failed = false;

for (const pattern of patterns) {
  try {
    const output = execFileSync("rg", ["-n", pattern, ...paths], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (output.trim()) {
      failed = true;
      console.error(`\nFound Vercel-risk React namespace pattern: ${pattern}`);
      console.error(output.trim());
    }
  } catch (error) {
    if (error.status !== 1) {
      throw error;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log("React type boundary scan passed.");
