#!/bin/sh

set -eu

# Run from the consumer root; locate the executing engine without assuming its depth.
PROJECT_DIR=$PWD
CORE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# Project setup also runs outside a consumer (new project from the engine).
if [ "${1:-}" = new ]; then
  shift
  # A fresh clone has no node_modules yet: install them with the pinned manager.
  node "$CORE_DIR/scripts/dependencies.js" --runtime || exit 1
  exec node "$CORE_DIR/scripts/new.js" "$@"
fi
CORE_PATH=${CORE_DIR#"$PROJECT_DIR"/}
case "$CORE_PATH" in
  core|themes/sansoul) ;;
  *) printf '%s\n' 'Run the SanSoul wrapper from its consumer project root.' >&2; exit 2 ;;
esac

# Variables
PROJECT="${PWD##*/}"
COMMAND=${1:-}
PATH="$CORE_DIR/scripts/bin:$PWD/node_modules/.bin:$PATH"
export PATH

case "$COMMAND" in
  ''|help|-h|--help)
    cat <<'HELP'
SanSoul commands (run from the project root):
  sh do dev       Watch site and prebuild inputs without CMS assets.
  sh do cms       Watch site and prebuild inputs with the CMS.
  sh do preview   Experimental local structural CMS preview in an isolated copy.
  sh do build     Compile and validate the site.
  sh do local     Rebuild production on changes and serve localhost:1313 (+ local Worker on /api/*).
  sh do check     Run regression checks and build the site.
  sh do update    Update the engine, migrate and validate the project.
  sh do update --check  Inspect the update plan without changing the checkout.
  sh do up [message]    Commit everything, bring remote changes in and push.
  sh do down      Bring remote changes in, keeping local work in place.
  sh do fonts     Convert .ttf/.otf in assets/fonts into uploads/fonts/*.woff2.
  sh do new [domain --owner org]  Set up a project (plan; --apply to run). --help for options.
Aliases: server = dev; live = local; hugo = build.
HELP
    exit 0
    ;;
esac

# Functions
lecho() { echo "\033[7;34m $1 \033[0m"; } # 🟦 Header
hecho() { echo "\033[7;37m $1 \033[0m"; } # ⬜️ Header
secho() { echo "\033[1;32m$1\033[0m"; }   # ✅ Success
wecho() { echo "\033[1;33m$1\033[0m"; }   # 🟡 Warning
eecho() { echo "\033[1;31m$1\033[0m"; }   # ❌ Error
iecho() { echo "\033[1;34m$1\033[0m"; }   # 💙 Info
vecho() { echo "\033[1;36m$1\033[0m"; }   # 🩵 Value

# Keep generated outputs and development servers mutually exclusive. Nested
# commands inherit the owner token and are validated without taking a second
# lock, while direct build commands acquire the same per-project lock.
case "$COMMAND" in
  update|check|rm-public|imgs|videos|prebuild|hugo-development|hugo-production|build|hugo)
    if [ -n "${SANSOUL_LIFECYCLE_TOKEN:-}" ]; then
      node "$CORE_DIR/scripts/lifecycle.js" validate "$SANSOUL_LIFECYCLE_TOKEN" || {
        eecho "Invalid SanSoul lifecycle owner token"
        exit 1
      }
    else
      exec node "$CORE_DIR/scripts/lifecycle.js" guard -- sh "$CORE_DIR/do" "$@"
    fi
    ;;
esac


##################
## GIT COMMANDS ##
##################

# Safe sync: conflicts without an obvious answer never stay half-done; the work
# goes to a local/<date> branch and a prompt for an agent is written.
if [ "$COMMAND" = up ] || [ "$COMMAND" = down ]; then
  node "$CORE_DIR/scripts/git-sync.js" "$@"


##################
## DEV COMMANDS ##
##################

# Show or record consumer migrations
elif [ "$COMMAND" = migrations ]; then
  shift
  node "$CORE_DIR/scripts/migrations.js" "$@"

# Synchronize managed documentation blocks in the consumer project root
elif [ "$COMMAND" = root-docs ]; then
  shift
  node "$CORE_DIR/scripts/root-docs.js" "$@"

# Preflight, update SanSoul, apply automated migrations, sync root docs, and build
elif [ "$COMMAND" = update ]; then
  shift
  node "$CORE_DIR/scripts/update.js" "$@"

# Convert .ttf/.otf font files into the woff2 faces the build looks up
elif [ "$COMMAND" = fonts ]; then
  node "$CORE_DIR/scripts/fonts.js"


#####################
## SERVER COMMANDS ##
#####################

# Run portable syntax checks and the complete build
elif [ "$COMMAND" = check ]; then

  hecho "CHECK JAVASCRIPT"
  find "$CORE_DIR/assets/js" "$CORE_DIR/scripts" -type f -name '*.js' -exec sh -c 'for file do node --check "$file" || exit; done' sh {} +

  hecho "CHECK SHELL"
  sh -n ./do
  sh -n "$CORE_DIR/do"
  sh -n "$CORE_DIR/scripts/bin/sass"
  sh -n "$CORE_DIR/scripts/mirror-to-gitlab.sh"
  sh -n "$CORE_DIR/ci/run"

  hecho "CHECK TOOLING REGRESSIONS"
  node --test "$CORE_DIR"/scripts/tests/*.test.js

  sh do build

# Site development with the same prebuild supervisor as CMS mode.
elif [ "$COMMAND" = dev ] || [ "$COMMAND" = server ]; then

  hecho "HUGO DEVELOPMENT SERVER"
  shift
  exec node "$CORE_DIR/scripts/local-server.js" dev "$@"

# CMS development.
elif [ "$COMMAND" = cms ]; then

  hecho "HUGO SERVER WITH CMS CACHE INVALIDATION AND PREBUILD WATCHER"
  shift
  exec node "$CORE_DIR/scripts/local-server.js" cms "$@"

# Experimental structural preview uses its own isolated workspace.
elif [ "$COMMAND" = preview ]; then

  shift
  exec node "$CORE_DIR/scripts/structural-preview-server.js" "$@"

# Production fidelity with full rebuilds and post-processing.
elif [ "$COMMAND" = local ] || [ "$COMMAND" = live ]; then

  hecho "LOCAL PRODUCTION SERVER"
  shift
  exec node "$CORE_DIR/scripts/production-server.js" "$@"


#####################
## DEPLOY COMMANDS ##
#####################

# Remove public directorie
elif [ "$COMMAND" = rm-public ]; then

  hecho "REMOVE PUBLIC AND TMP RESOURCES DIRECTORIE"
  rm -rf public resources

# Images ICO, PNG and AVIF
elif [ "$COMMAND" = imgs ]; then

  hecho "IMAGES ICO, PNG AND AVIF"
  node "$CORE_DIR/scripts/imgs.js"

# Refresh referenced video metadata; --refresh bypasses the persisted cache.
elif [ "$COMMAND" = videos ]; then

  shift
  node "$CORE_DIR/scripts/video-metadata.js" "$@"

# Enter in to prebuild folder, build hugo and go back
elif [ "$COMMAND" = prebuild ]; then

  if [ "${SANSOUL_VIDEO_METADATA_WATCH:-}" != 1 ]; then
    hecho "REFRESH REFERENCED VIDEO METADATA"
    node "$CORE_DIR/scripts/video-metadata.js"
  fi

  hugo version

  hecho "GO SANSOUL PREBUILD"

  PREBUILD_TMP=$(mktemp -d "${TMPDIR:-/tmp}/sansoul-prebuild.XXXXXX")
  trap 'rm -rf "$PREBUILD_TMP"' EXIT HUP INT TERM

  hecho "RUN HUGO PREBUILD"
  node "$CORE_DIR/scripts/prebuild-config.js" "$PREBUILD_TMP/config.yml"
  cd "$CORE_DIR/prebuild"
  hugo --destination "$PREBUILD_TMP" --config "$PROJECT_DIR/hugo.yml,$PREBUILD_TMP/config.yml"

  hecho "PUBLISH PREBUILD CONFIG"
  mkdir -p public
  if [ -f public/hugo.prebuild.yml ] && cmp -s "$PREBUILD_TMP/hugo.prebuild.yml" public/hugo.prebuild.yml
  then
    rm -f "$PREBUILD_TMP/hugo.prebuild.yml"
  else
    mv "$PREBUILD_TMP/hugo.prebuild.yml" public/hugo.prebuild.yml
  fi
  rm -rf public/content
  rm -rf "$PREBUILD_TMP"
  trap - EXIT HUP INT TERM

  hecho "GO PROJECT"
  cd "$PROJECT_DIR"

# # If multilang, copy 404 file in root
# elif [ $1 = multilang ]
# then

#   lang=$(grep '^defaultContentLanguage:' ./data/langs.yml | awk '{print $2}' || echo 'es')
#   lang=${lang:-es}
#   if [ -e "./public/${lang}/404.html" ]
#   then
#     hecho "MULTILANG: COPY 404 FILE IN ROOT"
#     cp ./public/${lang}/404.html ./public/
#   fi

# Hugo build as developement environement
elif [ "$COMMAND" = hugo-development ]; then

  sh do rm-public
  sh do prebuild

  # remove cache directories
  rm -rf public resources
  # Commerce adapters opt in to the private catalog; other projects skip it.
  if [ -d ./functions/api ]; then node "$CORE_DIR/commerce/scripts/build-catalog.js"; fi

  hecho "RUN HUGO DEVELOPMENT"
  hugo --gc --buildFuture --environment development --config "$CORE_PATH/hugo.default.yml,$CORE_PATH/prebuild/public/hugo.prebuild.yml,hugo.yml"
  # Worker forms publish their policies in public/_forms; keep them out of assets.
  if [ -d public/_forms ] || [ -f worker/forms.generated.js ]; then
    node "$CORE_DIR/forms/scripts/build-manifest.js" || { rm -rf public/_forms; exit 1; }
  fi

# Hugo build as production environement
elif [ "$COMMAND" = hugo-production ]; then

  sh do rm-public
  sh do prebuild
  # Commerce adapters opt in to the private catalog; other projects skip it.
  if [ -d ./functions/api ]; then node "$CORE_DIR/commerce/scripts/build-catalog.js"; fi

  hecho "RUN HUGO PRODUCTION"
  hugo --config "$CORE_PATH/hugo.default.yml,$CORE_PATH/hugo.production.yml,$CORE_PATH/prebuild/public/hugo.prebuild.yml,hugo.yml"
  # Worker forms publish their policies in public/_forms; keep them out of assets.
  if [ -d public/_forms ] || [ -f worker/forms.generated.js ]; then
    node "$CORE_DIR/forms/scripts/build-manifest.js" || { rm -rf public/_forms; exit 1; }
  fi

  sh do imgs
  # sh do multilang

# Hugo check environement and build
elif [ "$COMMAND" = build ] || [ "$COMMAND" = hugo ]; then

  if [ ! -d ./node_modules ]; then
    hecho "INSTALL PRODUCTION DEPENDENCIES"
    node "$CORE_DIR/scripts/dependencies.js"
  fi

  start_ms=$(node -p "Date.now()")

  # Deploy with environement
  development=$(grep '^\s\sdevelopment:' ./data/config.yml | awk '{print $2}')
  if test "$development" = "true" && [ "${SANSOUL_BUILD_PRODUCTION:-}" != 1 ]
  then
    sh do hugo-development
  else
    sh do hugo-production
  fi

  node "$CORE_DIR/scripts/check-cms-config.js"

  end_ms=$(node -p "Date.now()")
  elapsed=$(node -p "Number(process.argv[1]) - Number(process.argv[2])" "$end_ms" "$start_ms")
  echo "\033[1;36m🕑 $elapsed ms\033[0m"

else

  echo "Unknown command: '$COMMAND'" >&2
  exit 2

fi
