#!/bin/bash
set -e

echo "🔧 Installing dependencies with platform binaries..."

# Force clean install with optional dependencies
npm ci --include=optional --fund=false

# Verify rollup binary exists
if [ ! -f "node_modules/.bin/rollup" ]; then
  echo "❌ Rollup binary not found, trying alternative install..."
  npm install rollup --save-dev --include=optional
fi

echo "✅ Dependencies installed successfully"

echo "🏗️ Building project..."
npm run build

echo "✅ Build completed successfully" 