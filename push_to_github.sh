#!/bin/bash
# Run this script from the Alpine-skiing-project folder on your Mac
# Usage: cd "Stanford application project" && bash push_to_github.sh

set -e

echo "=== Step 1: Remove stale lock file ==="
rm -f .git/index.lock

echo "=== Step 2: Push version-1 branch (existing files snapshot) ==="
git push -u origin version-1

echo "=== Step 3: Push main branch (with all new files) ==="
git push origin main

echo ""
echo "=== Done! ==="
echo "  - version-1 branch: snapshot of original files (Initial commit)"
echo "  - main branch: updated code + tracks B-F reports + evaluation results"
echo ""
echo "View your repo: https://github.com/smiky2011/Alpine-skiing-project"
