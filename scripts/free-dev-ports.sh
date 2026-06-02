#!/usr/bin/env bash
# Frees Palot dev ports when a previous turbo/vite/bun process was left running.
set -euo pipefail
for port in 1420 3100; do
	if fuser "${port}/tcp" >/dev/null 2>&1; then
		echo "Releasing port ${port}..."
		fuser -k "${port}/tcp" >/dev/null 2>&1 || true
	fi
done