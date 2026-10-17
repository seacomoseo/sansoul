#!/bin/sh

set -eu

# Run from the consumer root; locate the executing engine without assuming its depth.
PROJECT_DIR=$PWD
CORE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
CORE_PATH=${CORE_DIR#"$PROJECT_DIR"/}
case "$CORE_PATH" in
  core|themes/sansoul) ;;
  *) printf '%s\n' 'Run the SanSoul wrapper from its consumer project root.' >&2; exit 2 ;;
esac

# Variables
PROJECT="${PWD##*/}"
COMMAND=${1:-}
PATH="$CORE_DIR/scripts/bin:$PWD/node_modules/.bin:$PWD/../_tools/node_modules/.bin:$PATH"
export PATH

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
  update|check|rm-public|imgs|videos|prebuild|hugo-development|hugo-production|hugo)
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

if [ "$COMMAND" = up ]; then
  . ../_tools/git/up.sh
elif [ "$COMMAND" = sup ]; then
  . ../_tools/git/sup.sh
elif [ "$COMMAND" = spush ]; then
  . ../_tools/git/spush.sh
elif [ "$COMMAND" = down ]; then
  . ../_tools/git/down.sh
elif [ "$COMMAND" = sdown ]; then
  . ../_tools/git/sdown.sh
elif [ "$COMMAND" = spull ]; then
  . ../_tools/git/spull.sh
elif [ "$COMMAND" = merge ]; then
  . ../_tools/git/merge.sh
elif [ "$COMMAND" = smerge ]; then
  . ../_tools/git/smerge.sh
elif [ "$COMMAND" = sreset ]; then
  . ../_tools/git/sreset.sh
elif [ "$COMMAND" = sremote ]; then
  . ../_tools/git/sremote.sh
elif [ "$COMMAND" = scheck ]; then
  . ../_tools/git/scheck.sh
elif [ "$COMMAND" = sbranch ]; then
  . ../_tools/git/sbranch.sh
elif [ "$COMMAND" = du ]; then
  sh do down
  sh do up
elif [ "$COMMAND" = sdu ]; then
  sh do sdown
  sh do sup


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

# Normalize yaml and markdown files
elif [ "$COMMAND" = normalize ]; then
  python3 ../_tools/others/yaml-normalize.py

# Refactoring spaces in Hugo
elif [ "$COMMAND" = spaces ]; then
  sh ../_tools/others/refactoring-spaces.sh "$2"

# Create favicon.ico
elif [ "$COMMAND" = favicon ]; then
  . ../_tools/others/favicon.sh

# Create woff2 and scss by font files
elif [ "$COMMAND" = fonts ]; then
  . ../_tools/others/fonts.sh

# Download woff2 from Google Fonts by font styles
elif [ "$COMMAND" = gfonts ]; then
  node ../_tools/others/gfonts.js "$PROJECT"

# Remove binary files from history
elif [ "$COMMAND" = clean ]; then
  . ../_tools/others/remove-history-binary-files.sh

# Check yaml error of Static CMS
elif [ "$COMMAND" = yml ]; then
  node ../_tools/others/check-yaml.js "$PROJECT" "${2:-}"

# Get data of place by Google API
elif [ "$COMMAND" = places ]; then
  COLOR=$(awk '/main:/ {found=1} found && /color:/ {gsub(/'\''/, "", $2); print $2; exit}' ./data/styles.yml)
  LANGS=$(grep 'lang:' data/langs.yml | awk -F': ' '{print $2}')
  for LANG in $LANGS; do
    node ../_tools/others/fetch-place.js "$PROJECT" "$COLOR" "$LANG" "${2:-}"
  done

# Scrap reviews by Google Maps
elif [ "$COMMAND" = reviews ]; then
  # do reviews "Inspirits Bar"
  LANGS=$(grep 'lang:' data/langs.yml | awk -F': ' '{print $2}')
  for LANG in $LANGS; do
    node ../_tools/others/scrape-reviews.js "$PROJECT" "$LANG" "${2:-}"
  done


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

  hecho "CHECK TOOLING REGRESSIONS"
  node --test "$CORE_DIR"/scripts/tests/*.test.js

  sh do hugo

# Hugo development server with a one-time prebuild. `server` remains a
# compatible alias for consumers that have not adopted the shorter command.
elif [ "$COMMAND" = dev ] || [ "$COMMAND" = server ]; then

  hecho "HUGO DEVELOPMENT SERVER"
  shift
  node "$CORE_DIR/scripts/server-lifecycle.js" dev "$@"

# CMS + Hugo server with prebuild and source watchers. `local` remains a
# compatible alias for consumers that use the older command name.
elif [ "$COMMAND" = live ] || [ "$COMMAND" = local ]; then

  hecho "HUGO SERVER WITH CMS CACHE INVALIDATION AND PREBUILD WATCHER"
  shift
  node "$CORE_DIR/scripts/local-server.js" "$@"


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

  hecho "RUN HUGO DEVELOPMENT"
  hugo --gc --buildFuture --environment development --config "$CORE_PATH/hugo.default.yml,$CORE_PATH/prebuild/public/hugo.prebuild.yml,hugo.yml"

# Hugo build as production environement
elif [ "$COMMAND" = hugo-production ]; then

  sh do rm-public
  sh do prebuild

  hecho "RUN HUGO PRODUCTION"
  hugo --config "$CORE_PATH/hugo.default.yml,$CORE_PATH/hugo.production.yml,$CORE_PATH/prebuild/public/hugo.prebuild.yml,hugo.yml"

  sh do imgs
  # sh do multilang

# Hugo check environement and build
elif [ "$COMMAND" = hugo ]; then

  if [ ! -d ./node_modules ]; then
    hecho "INSTALL PRODUCTION DEPENDENCIES"
    node "$CORE_DIR/scripts/dependencies.js"
  fi

  start_ms=$(node -p "Date.now()")

  # Deploy with environement
  development=$(grep '^\s\sdevelopment:' ./data/config.yml | awk '{print $2}')
  if test "$development" = "true"
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
