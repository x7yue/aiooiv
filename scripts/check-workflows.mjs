import { readFileSync } from "node:fs";

const desktopCi = readFileSync(".github/workflows/desktop-ci.yml", "utf8");
const release = readFileSync(".github/workflows/release.yml", "utf8");

const checks = [
  {
    name: "Desktop CI Windows build must avoid WiX/MSI",
    ok: desktopCi.includes("bun run tauri build --bundles nsis"),
    hint: "Use `bun run tauri build --bundles nsis` for the Windows desktop CI build.",
  },
  {
    name: "Desktop CI must not install WiX for the NSIS-only build",
    ok: !desktopCi.includes("choco install wixtoolset"),
    hint: "Remove the WiX install step from Desktop CI after switching Windows CI to NSIS.",
  },
  {
    name: "Release Windows builds must consistently use NSIS",
    ok:
      release.includes('args: "--bundles nsis"') &&
      !release.includes("choco install wixtoolset"),
    hint: "Keep release Windows packaging on NSIS and do not install WiX in release jobs.",
  },
];

let failed = false;

for (const check of checks) {
  if (check.ok) {
    console.log(`ok - ${check.name}`);
  } else {
    failed = true;
    console.error(`not ok - ${check.name}`);
    console.error(`  ${check.hint}`);
  }
}

if (failed) {
  process.exit(1);
}
