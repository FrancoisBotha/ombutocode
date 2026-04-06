# Build and run Ombuto Code.
#
# Usage: .\buildandrun.ps1

# Clear ELECTRON_RUN_AS_NODE so Electron runs as a full app, not plain Node.js
$env:ELECTRON_RUN_AS_NODE = $null

npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

npm run start
