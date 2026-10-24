import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(path.join(root, "server", "dist", "src", "lib", "email"), { recursive: true });
await cp(
  path.join(root, "server", "src", "lib", "email", "templates"),
  path.join(root, "server", "dist", "src", "lib", "email", "templates"),
  { recursive: true },
);
