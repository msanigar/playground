#!/bin/bash
set -e

echo "🔧 Installing dependencies with platform binaries..."

# Force clean install with optional dependencies
npm ci --include=optional --fund=false

echo "🔧 Force installing Rollup platform binary..."
# Explicitly install the Linux x64 Rollup binary
npm install @rollup/rollup-linux-x64-gnu --no-save --force || echo "⚠️ Platform binary install failed, continuing..."

# Alternative: Install Rollup binary directly if the platform-specific one fails
if [ ! -d "node_modules/@rollup/rollup-linux-x64-gnu" ]; then
  echo "🔄 Installing Rollup with alternative method..."
  npm install rollup --save-dev --include=optional --force
fi

# Verify node_modules structure
echo "🔍 Checking Rollup installation..."
ls -la node_modules/@rollup/ || echo "No @rollup directory found"
ls -la node_modules/rollup/ || echo "No rollup directory found"

echo "✅ Dependencies installed successfully"

echo "🏗️ Building project..."
if npm run build; then
  echo "✅ Build completed successfully"
else
  echo "❌ Primary build failed, trying fallback build method..."
  if npm run build:fallback; then
    echo "✅ Fallback build completed successfully"
  else
    echo "❌ Both build methods failed, exiting..."
    exit 1
  fi
fi 