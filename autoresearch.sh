#!/usr/bin/env bash
set -euo pipefail
exec bun --no-env-file "$(dirname -- "${BASH_SOURCE[0]}")/scripts/autoresearch.ts" "$@"
