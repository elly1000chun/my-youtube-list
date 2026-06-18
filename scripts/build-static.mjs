import { access, copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(projectRoot, "dist");

const packageJson = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));
if (!packageJson.version) {
    throw new Error("package.json version is missing.");
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

await writeFile(
    resolve(projectRoot, "version.json"),
    `${JSON.stringify({ version: packageJson.version }, null, 2)}\n`,
    "utf8"
);

await copyFile(resolve(projectRoot, "index.html"), resolve(distDir, "index.html"));
await copyFile(resolve(projectRoot, "styles.css"), resolve(distDir, "styles.css"));
await copyFile(resolve(projectRoot, "favicon.svg"), resolve(distDir, "favicon.svg"));
await copyFile(resolve(projectRoot, "version.json"), resolve(distDir, "version.json"));
await cp(resolve(projectRoot, "src"), resolve(distDir, "src"), { recursive: true });
await writeConfigFile();

async function writeConfigFile() {
    const envClientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const distConfigPath = resolve(distDir, "config.js");

    if (envClientId) {
        await writeFile(
            distConfigPath,
            `window.APP_CONFIG = {\n    googleClientId: ${JSON.stringify(envClientId)},\n};\n`,
            "utf8"
        );
        return;
    }

    const localConfigPath = resolve(projectRoot, "config.js");
    if (await exists(localConfigPath)) {
        await copyFile(localConfigPath, distConfigPath);
        return;
    }

    await copyFile(resolve(projectRoot, "config.example.js"), distConfigPath);
}

async function exists(path) {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}
