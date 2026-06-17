import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = resolve(projectRoot, "package.json");
const versionPath = resolve(projectRoot, "version.json");

const packageJson = JSON.parse(await readFile(packagePath, "utf8"));

if (!packageJson.version) {
    throw new Error("package.json version is missing.");
}

await writeFile(
    versionPath,
    `${JSON.stringify({ version: packageJson.version }, null, 2)}\n`,
    "utf8"
);
