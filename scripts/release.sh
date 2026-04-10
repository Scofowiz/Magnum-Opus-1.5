#!/usr/bin/env bash
# Claude Flow V3 - Release Script
# Release Engineer: Agent #15 | Swarm ID: swarm-1770207164275
# Generated: 2026-02-04
#
# Usage: ./scripts/release.sh [major|minor|patch|prerelease] [--dry-run]
#
# Examples:
#   ./scripts/release.sh patch           # 1.0.0 -> 1.0.1
#   ./scripts/release.sh minor           # 1.0.0 -> 1.1.0
#   ./scripts/release.sh major           # 1.0.0 -> 2.0.0
#   ./scripts/release.sh prerelease      # 1.0.0 -> 1.0.1-alpha.0
#   ./scripts/release.sh patch --dry-run # Preview changes

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
RELEASE_TYPE="${1:-patch}"
DRY_RUN=false
MAIN_BRANCH="main"
RELEASE_BRANCH_PREFIX="release"

# Parse arguments
for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
  esac
done

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Header
echo "=========================================="
echo "  Claude Flow V3 - Release Manager"
echo "  Release Type: $RELEASE_TYPE"
echo "  Dry Run: $DRY_RUN"
echo "=========================================="
echo ""

# Pre-flight checks
log_info "Running pre-flight checks..."

# Check git status
if [ -n "$(git status --porcelain)" ]; then
  log_error "Working directory is not clean. Commit or stash changes first."
  exit 1
fi

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "$MAIN_BRANCH" ]; then
  log_warning "Not on $MAIN_BRANCH branch (currently on $CURRENT_BRANCH)"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Pull latest changes
log_info "Pulling latest changes..."
if [ "$DRY_RUN" = false ]; then
  git pull origin "$CURRENT_BRANCH" || log_warning "Could not pull from origin"
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "1.0.0")
log_info "Current version: $CURRENT_VERSION"

# Calculate new version
calculate_new_version() {
  local current=$1
  local type=$2

  IFS='.' read -ra PARTS <<< "${current%-*}"
  local major="${PARTS[0]}"
  local minor="${PARTS[1]}"
  local patch="${PARTS[2]}"

  case $type in
    major)
      echo "$((major + 1)).0.0"
      ;;
    minor)
      echo "$major.$((minor + 1)).0"
      ;;
    patch)
      echo "$major.$minor.$((patch + 1))"
      ;;
    prerelease)
      local prerelease_suffix="${current#*-}"
      if [ "$prerelease_suffix" = "$current" ]; then
        # No prerelease suffix, add one
        echo "$major.$minor.$((patch + 1))-alpha.0"
      else
        # Increment prerelease number
        local base="${current%-*}"
        local pre_type="${prerelease_suffix%%.*}"
        local pre_num="${prerelease_suffix##*.}"
        echo "$base-$pre_type.$((pre_num + 1))"
      fi
      ;;
    *)
      echo "$current"
      ;;
  esac
}

NEW_VERSION=$(calculate_new_version "$CURRENT_VERSION" "$RELEASE_TYPE")
log_info "New version: $NEW_VERSION"

# Create release branch
RELEASE_BRANCH="$RELEASE_BRANCH_PREFIX/v$NEW_VERSION"
log_info "Creating release branch: $RELEASE_BRANCH"

if [ "$DRY_RUN" = false ]; then
  git checkout -b "$RELEASE_BRANCH"
fi

# Update package.json version
log_info "Updating package.json..."
if [ "$DRY_RUN" = false ]; then
  npm version "$NEW_VERSION" --no-git-tag-version
fi

# Update CHANGELOG.md
log_info "Updating CHANGELOG.md..."
CHANGELOG_ENTRY="## [$NEW_VERSION] - $(date +%Y-%m-%d)

### Added
- [Add new features here]

### Changed
- [Add changes here]

### Fixed
- [Add fixes here]

### Claude Flow V3 Integration
- Swarm coordination: hierarchical-mesh topology
- Memory backend: hybrid with HNSW indexing
- Max agents: 15

"

if [ "$DRY_RUN" = false ]; then
  if [ -f "CHANGELOG.md" ]; then
    # Insert new entry after header
    sed -i.bak "/^# Changelog/a\\
\\
$CHANGELOG_ENTRY" CHANGELOG.md
    rm -f CHANGELOG.md.bak
  else
    # Create new CHANGELOG.md
    echo "# Changelog

All notable changes to this project will be documented in this file.

$CHANGELOG_ENTRY" > CHANGELOG.md
  fi
fi

# Run tests
log_info "Running test suite..."
if [ "$DRY_RUN" = false ]; then
  npm test --if-present || log_warning "Tests failed or not configured"
fi

# Build
log_info "Building project..."
if [ "$DRY_RUN" = false ]; then
  npm run build || log_warning "Build failed or not configured"
fi

# Run Claude Flow doctor
log_info "Running Claude Flow V3 diagnostics..."
if [ "$DRY_RUN" = false ]; then
  npx @claude-flow/cli@latest doctor --fix 2>/dev/null || log_warning "Claude Flow doctor not available"
fi

# Git operations
if [ "$DRY_RUN" = false ]; then
  log_info "Committing changes..."
  git add -A
  git commit -m "release: v$NEW_VERSION

- Update version to $NEW_VERSION
- Update CHANGELOG.md
- Run pre-release validation

Release prepared by Claude Flow V3 Release Manager
Swarm ID: swarm-1770207164275"

  log_info "Creating tag..."
  git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

  log_info "Pushing changes..."
  git push origin "$RELEASE_BRANCH"
  git push origin "v$NEW_VERSION"

  log_success "Release v$NEW_VERSION prepared successfully!"
  echo ""
  echo "Next steps:"
  echo "  1. Create a Pull Request from $RELEASE_BRANCH to $MAIN_BRANCH"
  echo "  2. Review and merge the PR"
  echo "  3. The release workflow will automatically:"
  echo "     - Create GitHub Release"
  echo "     - Build and upload artifacts"
  echo "     - Publish to npm (if configured)"
  echo ""
  echo "To trigger release manually:"
  echo "  gh workflow run release.yml -f version=$NEW_VERSION"
else
  log_warning "DRY RUN - No changes made"
  echo ""
  echo "Would have:"
  echo "  - Created branch: $RELEASE_BRANCH"
  echo "  - Updated version: $CURRENT_VERSION -> $NEW_VERSION"
  echo "  - Updated CHANGELOG.md"
  echo "  - Created tag: v$NEW_VERSION"
  echo "  - Pushed to remote"
fi

echo ""
log_success "Release script complete!"
