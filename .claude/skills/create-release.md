---
name: create-release
description: >
  Create a new Scout RSOP release. Tags the repo, builds all platform binaries,
  and pushes the tag to trigger the GitHub Actions release workflow.
  Use when the user says "create a release", "release version X", or "tag and release".
---

# Create Scout RSOP Release

## Steps

1. **Confirm the version** with the user if not provided (semantic version, e.g. `v1.0.0`)

2. **Verify the build is clean:**
```bash
cd /Users/mathiast/Documents/VSCode/ScoutRSOP
cd web && npm run build && cd ..
go build ./...
```

3. **Update version references if needed** (CHANGELOG, README badge)

4. **Commit any outstanding changes:**
```bash
git add -A
git commit -m "Prepare release <version>"
```

5. **Tag and push:**
```bash
git tag <version>
git push origin main --tags
```

6. **GitHub Actions** will automatically:
   - Build 5 platform binaries (Windows/Linux amd64+arm64/macOS Intel+Apple Silicon)
   - Create a docs zip
   - Generate SHA-256 checksums
   - Create a GitHub Release with all assets

7. **Verify** the release at: https://github.com/mathiastornblom/ScoutRSOP/releases

## Notes
- The release workflow is defined in `.github/workflows/ci.yml`
- Version is injected into the binary via `-ldflags` (see `Makefile`)
- The in-app update checker polls this release API at startup
