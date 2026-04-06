#!/usr/bin/env bash
# Build and run Ombuto Code.
# Usage: ./buildandrun.sh

set -e

# Load nvm if available (needed for npm/node)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Clear ELECTRON_RUN_AS_NODE so Electron runs as a full app, not plain Node.js
unset ELECTRON_RUN_AS_NODE

# Navigate to the src directory relative to this script
cd "$(dirname "$0")/src"

# Install/update dependencies
echo "Installing dependencies..."
npm install

echo "Building..."
npm run build

echo "Starting Ombuto Code..."
npm run start
