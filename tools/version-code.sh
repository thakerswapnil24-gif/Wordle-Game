#!/usr/bin/env bash
#
# Derives the Play version code from a release tag.
#
# Google Play requires versionCode to be an integer that increases with every
# upload, and a code that has been used can never be reused — so a wrong value
# here is not something a later release can undo. The mapping is
#
#     v1.2.3  ->  10203        (MAJOR * 10000 + MINOR * 100 + PATCH)
#
# which keeps codes ordered the same way as versions, as long as MINOR and PATCH
# each stay below 100. That bound is enforced rather than assumed: without it
# v1.0.100 and v1.1.0 both produce 10100, and the second release Play sees would
# be rejected as a duplicate.
#
# Usage: tools/version-code.sh v1.2.3   ->  prints "1.2.3 10203"
set -euo pipefail

raw="${1-}"
name="${raw#v}"

if [ -z "$name" ]; then
  echo "usage: $0 vMAJOR.MINOR.PATCH" >&2
  exit 2
fi

if ! [[ "$name" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "error: tag must look like v1.2.3 (three numeric parts, no suffix); got '$raw'" >&2
  exit 1
fi

IFS='.' read -r major minor patch <<< "$name"

# 10# forces base 10: without it bash reads a zero-padded component such as 09
# as octal and fails with "value too great for base".
major=$((10#$major))
minor=$((10#$minor))
patch=$((10#$patch))

if [ "$minor" -gt 99 ] || [ "$patch" -gt 99 ]; then
  echo "error: MINOR and PATCH must each be below 100 so version codes stay unique and ordered; got '$raw'" >&2
  exit 1
fi

code=$(( major * 10000 + minor * 100 + patch ))

if [ "$code" -le 0 ]; then
  echo "error: version code must be positive; got '$raw'" >&2
  exit 1
fi

echo "$name $code"
