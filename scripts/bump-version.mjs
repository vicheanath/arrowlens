import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, "package.json");
const packageLockPath = path.join(rootDir, "package-lock.json");
const cargoTomlPath = path.join(rootDir, "src-tauri", "Cargo.toml");
const tauriConfigPath = path.join(rootDir, "src-tauri", "tauri.conf.json");

const versionArg = process.argv[2];

if (!versionArg) {
  console.error("Usage: npm run version:bump -- <major|minor|patch|alpha|beta|rc|x.y.z[-tag.n]>");
  process.exit(1);
}

const semverPattern = /^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.(\d+))?$/;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseVersion(version) {
  const match = version.match(semverPattern);
  if (!match) {
    throw new Error(`Invalid semver version: ${version}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prereleaseTag: match[4] ?? null,
    prereleaseNumber: match[5] ? Number(match[5]) : null,
  };
}

function formatVersion(parts) {
  const base = `${parts.major}.${parts.minor}.${parts.patch}`;
  if (!parts.prereleaseTag) return base;
  return `${base}-${parts.prereleaseTag}.${parts.prereleaseNumber}`;
}

function bumpStable(parts, kind) {
  const next = {
    major: parts.major,
    minor: parts.minor,
    patch: parts.patch,
    prereleaseTag: null,
    prereleaseNumber: null,
  };

  if (kind === "major") {
    next.major += 1;
    next.minor = 0;
    next.patch = 0;
    return next;
  }

  if (kind === "minor") {
    next.minor += 1;
    next.patch = 0;
    return next;
  }

  if (kind === "patch") {
    next.patch += 1;
    return next;
  }

  throw new Error(`Unsupported stable bump kind: ${kind}`);
}

function bumpPrerelease(parts, prereleaseTag) {
  const next = {
    major: parts.major,
    minor: parts.minor,
    patch: parts.patch,
    prereleaseTag,
    prereleaseNumber: 1,
  };

  if (parts.prereleaseTag === prereleaseTag && parts.prereleaseNumber !== null) {
    next.prereleaseNumber = parts.prereleaseNumber + 1;
  }

  return next;
}

function resolveNextVersion(currentVersion, input) {
  if (semverPattern.test(input)) {
    return input;
  }

  const current = parseVersion(currentVersion);

  if (["major", "minor", "patch"].includes(input)) {
    return formatVersion(bumpStable(current, input));
  }

  if (["alpha", "beta", "rc"].includes(input)) {
    return formatVersion(bumpPrerelease(current, input));
  }

  throw new Error(`Unsupported bump target: ${input}`);
}

function updateCargoVersion(fileText, nextVersion) {
  return fileText.replace(/^version = ".*"$/m, `version = "${nextVersion}"`);
}

const packageJson = readJson(packageJsonPath);
const currentVersion = packageJson.version;
const nextVersion = resolveNextVersion(currentVersion, versionArg);

packageJson.version = nextVersion;
writeJson(packageJsonPath, packageJson);

const packageLock = readJson(packageLockPath);
packageLock.version = nextVersion;
if (packageLock.packages?.[""]) {
  packageLock.packages[""].version = nextVersion;
}
writeJson(packageLockPath, packageLock);

const cargoToml = fs.readFileSync(cargoTomlPath, "utf8");
fs.writeFileSync(cargoTomlPath, updateCargoVersion(cargoToml, nextVersion));

const tauriConfig = readJson(tauriConfigPath);
tauriConfig.version = nextVersion;
writeJson(tauriConfigPath, tauriConfig);

console.log(nextVersion);