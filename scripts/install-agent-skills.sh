#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$REPO_ROOT/agent-skills"
CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"
TARGET_DIR="${TARGET_DIR:-$CODEX_HOME_DIR/skills}"
MODE="${1:-copy}"

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/install-agent-skills.sh [copy|link]

Defaults:
  copy  Copy repo-owned skills into $CODEX_HOME/skills
  link  Symlink repo-owned skills into $CODEX_HOME/skills

Environment overrides:
  CODEX_HOME  Alternate Codex home directory
  TARGET_DIR  Alternate skill install destination
USAGE
}

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "agent-skills directory not found: $SOURCE_DIR" >&2
  exit 1
fi

case "$MODE" in
  copy|link) ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac

mkdir -p "$TARGET_DIR"

for skill_path in "$SOURCE_DIR"/*; do
  [[ -d "$skill_path" ]] || continue
  skill_name="$(basename "$skill_path")"
  target_path="$TARGET_DIR/$skill_name"

  rm -rf "$target_path"

  if [[ "$MODE" == "link" ]]; then
    ln -s "$skill_path" "$target_path"
    echo "linked  $skill_name -> $target_path"
  else
    cp -R "$skill_path" "$target_path"
    echo "copied  $skill_name -> $target_path"
  fi
done

echo "Installed repo-owned agent skills from $SOURCE_DIR to $TARGET_DIR"
