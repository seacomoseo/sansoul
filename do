#!/bin/sh

# Variables
PROYECT="${PWD##*/}"

# Functions
lecho() { echo "\033[7;34m $1 \033[0m"; } # 🟦 Header
hecho() { echo "\033[7;37m $1 \033[0m"; } # ⬜️ Header
secho() { echo "\033[1;32m$1\033[0m"; }   # ✅ Success
wecho() { echo "\033[1;33m$1\033[0m"; }   # 🟡 Warning
eecho() { echo "\033[1;31m$1\033[0m"; }   # ❌ Error
iecho() { echo "\033[1;34m$1\033[0m"; }   # 💙 Info
vecho() { echo "\033[1;36m$1\033[0m"; }   # 🩵 Value


##################
## GIT COMMANDS ##
##################

if [ $1 = up ]; then
  source ../_tools/git/up.sh
elif [ $1 = sup ]; then
  source ../_tools/git/sup.sh
elif [ $1 = spush ]; then
  source ../_tools/git/spush.sh
elif [ $1 = down ]; then
  source ../_tools/git/down.sh
elif [ $1 = sdown ]; then
  source ../_tools/git/sdown.sh
elif [ $1 = spull ]; then
  source ../_tools/git/spull.sh
elif [ $1 = merge ]; then
  source ../_tools/git/merge.sh
elif [ $1 = smerge ]; then
  source ../_tools/git/smerge.sh
elif [ $1 = sreset ]; then
  source ../_tools/git/sreset.sh
elif [ $1 = sremote ]; then
  source ../_tools/git/sremote.sh
elif [ $1 = scheck ]; then
  source ../_tools/git/scheck.sh
elif [ $1 = sbranch ]; then
  source ../_tools/git/sbranch.sh
elif [ $1 = du ]; then
  sh do down
  sh do up
elif [ $1 = sdu ]; then
  sh do sdown
  sh do sup


##################
## DEV COMMANDS ##
##################

# Update version
elif [ $1 = update ]; then
  python3 ../_tools/updater/index.js

# Normalize yaml and markdown files
elif [ $1 = normalize ]; then
  python3 ../_tools/others/yaml-normalize.py

# Refactoring spaces in Hugo
elif [ $1 = spaces ]; then
  sh ../_tools/others/refactoring-spaces.sh $2

# Create favicon.ico
elif [ $1 = favicon ]; then
  source ../_tools/others/favicon.sh

# Create woff2 and scss by font files
elif [ $1 = fonts ]; then
  source ../_tools/others/fonts.sh

# Download woff2 from Google Fonts by font styles
elif [ $1 = gfonts ]; then
  node ../_tools/others/gfonts.js $PROYECT

# Remove binary files from history
elif [ $1 = clean ]; then
  source ../_tools/others/remove-history-binary-files.sh

# Check yaml error of Static CMS
elif [ $1 = yml ]; then
  node ../_tools/others/check-yaml.js $PROYECT $2

# Get data of place by Google API
elif [ $1 = places ]; then
  COLOR=$(awk '/main:/ {found=1} found && /color:/ {gsub(/'\''/, "", $2); print $2; exit}' ./data/styles.yml)
  LANGS=$(grep 'lang:' data/config.yml | awk -F': ' '{print $2}')
  for LANG in $LANGS; do
    node ../_tools/others/fetch-place.js $PROYECT $COLOR $LANG $2
  done

# Scrap reviews by Google Maps
elif [ $1 = reviews ]; then
  # do reviews "Inspirits Bar"
  LANGS=$(grep 'lang:' data/config.yml | awk -F': ' '{print $2}')
  for LANG in $LANGS; do
    node ../_tools/others/scrape-reviews.js $PROYECT $LANG $2
  done


#####################
## SERVER COMMANDS ##
#####################

# Hugo server with theme config
elif [ $1 = server ]; then

  sh do rm-public
  sh do prebuild

  hecho "HUGO SERVER"
  hugo server --disableFastRender --config themes/sansoul/hugo.default.yml,themes/sansoul/prebuild/public/hugo.prebuild.yml,hugo.yml

# CMS + hugo local
elif [ $1 = local ]; then

  sh do rm-public
  sh do prebuild

  hecho "HUGO SERVER WITHOUT CMS CACHE"
  hugo server --noHTTPCache --ignoreCache --disableFastRender --config themes/sansoul/hugo.default.yml,themes/sansoul/hugo.local.yml,themes/sansoul/prebuild/public/hugo.prebuild.yml,hugo.yml


#####################
## DEPLOY COMMANDS ##
#####################

# Remove public directorie
elif [ $1 = rm-public ]; then

  hecho "REMOVE PUBLIC AND TMP RESOURCES DIRECTORIE"
  rm -r public
  rm -r resources

# Like purge CSS
elif [ $1 = css-purge ]; then

  hecho "CSS PURGE"
  node ./themes/sansoul/assets/js/node/css-purge.js

# Images ICO, PNG and AVIF
elif [ $1 = images ]; then

  hecho "IMAGES ICO, PNG AND AVIF"
  node ./themes/sansoul/assets/js/node/images.js

# Enter in to prebuild folder, build hugo and go back
elif [ $1 = prebuild ]; then

  hugo version

  hecho "GO SANSOUL PREBUILD"
  cd themes/sansoul/prebuild

  hecho "REMOVE PUBLIC DIRECTORIE"
  rm -r public

  hecho "RUN HUGO PREBUILD"
  hugo --config ../../../hugo.yml,hugo.yml

  hecho "GO PROJECT"
  cd ../../..

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
elif [ $1 = hugo-development ]; then

  sh do rm-public
  sh do prebuild

  # remove cache directories
  rm -rf public resources

  hecho "RUN HUGO DEVELOPMENT"
  hugo --gc --buildFuture --environment development --config themes/sansoul/hugo.default.yml,themes/sansoul/prebuild/public/hugo.prebuild.yml,hugo.yml

# Hugo build as production environement
elif [ $1 = hugo-production ]; then

  sh do rm-public
  sh do prebuild

  hecho "COPY FILES FROM SANSOUL TO PROJECT"
  cp ./themes/sansoul/postcss.config.js ./

  hecho "RUN HUGO PRODUCTION"
  hugo --config themes/sansoul/hugo.default.yml,themes/sansoul/hugo.production.yml,themes/sansoul/prebuild/public/hugo.prebuild.yml,hugo.yml

  # sh do css-purge
  sh do images
  # sh do multilang

# Hugo check environement and build
elif [ $1 = hugo ]; then

  start_ms=$(node -p "Number(Date.now().toString().slice(-5)).toString()")

  # Deploy with environement
  development=$(grep '^\s\sdevelopment:' ./data/config.yml | awk '{print $2}')
  if test "$development" = "true"
  then
    sh do hugo-development
  else
    sh do hugo-production
  fi

  end_ms=$(node -p "Number(Date.now().toString().slice(-5)).toString()")
  elapsed=$((end_ms - start_ms))
  echo "\033[1;36m🕑 $elapsed ms\033[0m"

else

  echo "'$1' no es un parámetro válido"

fi