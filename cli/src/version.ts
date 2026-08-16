import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

interface PackageJson {
  version: string;
}

/**
 * Reads the CLI's own installed version at runtime rather than a compile-time
 * JSON import — package.json lives outside tsconfig.json's rootDir ("src").
 */
export function getInstalledVersion(): string {
  const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as PackageJson;
  return pkg.version;
}
