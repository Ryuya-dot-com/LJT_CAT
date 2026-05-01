#!/usr/bin/env bash
# Convenience runner for the LJT-CAT regression test suite.
# Usage: bash tests/run.sh   (or:  ./tests/run.sh   after chmod +x)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
exec node "${HERE}/cat_simulation.test.js" "$@"
