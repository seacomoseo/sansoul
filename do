#!/bin/sh

# Variables
PROYECT="${PWD##*/}"
STI="\033[7;37m"
STE="\033[0m"

# COMMANDS FOR PROJECTS

# Upload with date now
if [ $1 = up ]
then

  echo "${STI} DO UP ${STE}"

  echo "${STI} ADD ${STE}"
  git add .

  echo "${STI} COMMIT ${STE}"
  git commit -m "Update: `date +'%Y-%m-%d %H:%M:%S'`"

  echo "${STI} PUSH ${STE}"
  git push

# Upload submodule changes with date now
elif [ $1 = sup ]
then

  echo "${STI} SUBMODULE SYNC ${STE}"
  git submodule sync --recursive

  echo "${STI} GO SANSOUL ${STE}"
  cd themes/sansoul

  echo "${STI} SANSOUL FETCH ${STE}"
  git fetch

  echo "${STI} SANSOUL CHECKOUT ORIGIN/MAIN ${STE}"
  git checkout -B main origin/main

  echo "${STI} SANSOUL ADD ${STE}"
  git add .

  echo "${STI} SANSOUL COMMIT ${STE}"
  git commit -m "Update submodule: `date +'%Y-%m-%d %H:%M:%S'`"

  echo "${STI} SANSOUL PUSH ${STE}"
  git push

  echo "${STI} GO PROJECT ${STE}"
  cd ../..

# Pull of repository and update the submodules
elif [ $1 = down ]
then

  echo "${STI} DO DOWN ${STE}"

  echo "${STI} PULL ${STE}"
  git pull

  echo "${STI} SUBMODULE UPDATE ${STE}"
  git submodule update --recursive --remote

# Pull of repository and update the submodules
elif [ $1 = du ]
then

  sh do down
  sh do up

# Hugo server with theme config
elif [ $1 = rm-public ]
then

  echo "${STI} REMOVE PUBLIC DIRECTORIE ${STE}"
  rm -r public

# Hugo server with theme config
elif [ $1 = server ]
then

  sh do rm-public
  sh do prebuild

  echo "${STI} HUGO SERVER ${STE}"
  hugo server --config themes/sansoul/hugo.default.yml,themes/sansoul/prebuild/public/hugo.prebuild.yml,hugo.yml

# Create woff2 and scss by font files
elif [ $1 = normalize ]
then

  echo "${STI} NORMALIZE YAML AND MARKDOWN FILES ${STE}"
  python3 ../_tools/others/yaml-normalize.py

# Create woff2 and scss by font files
elif [ $1 = fonts ]
then

  SRC_DIR="assets/fonts"
  DEST_DIR="static/fonts"
  CSS_FILE="assets/css/_fonts.scss"

  # Create output dir if not exist
  mkdir -p $DEST_DIR

  # Each font
  for font in $SRC_DIR/*; do
    if [ -f "$font" ]; then
      filename=$(basename "$font" | cut -d. -f1)
      filename_min=$(echo "$filename" | tr '[:upper:]' '[:lower:]')
      fontname=$(fc-scan --format "%{family}" "$font")
      if [ -z "$fontname" ]; then
        fontname="$filename"
      elif [[ $fontname == *,* ]]; then
        fontname=${fontname%%,*}
      fi

      type=$(fc-scan --format "%{style}" "$font")

      style="normal"
      if [[ $type == *"Italic"* ]]; then
        style="italic"
      fi

      weight="400"
      if [[ $type == "Thin"* ]]; then
        weight="100"
      elif [[ $type == "ExtraLight"* ]]; then
        weight="200"
      elif [[ $type == "Light"* ]]; then
        weight="300"
      elif [[ $type == "Regular"* ]]; then
        weight="400"
      elif [[ $type == "Medium"* ]]; then
        weight="500"
      elif [[ $type == "SemiBold"* ]]; then
        weight="600"
      elif [[ $type == "Bold"* ]]; then
        weight="700"
      elif [[ $type == "ExtraBold"* ]]; then
        weight="800"
      elif [[ $type == "Black"* ]]; then
        weight="900"
      fi

      # To woff2
      woff2_compress "$font"
      mv "$SRC_DIR/$filename.woff2" "$DEST_DIR/$filename_min.woff2"

      # Add to CSS
      echo \
"@font-face {
  font-family: '$fontname';
  src: url('/fonts/$filename_min.woff2') format('woff2');
  font-style: $style;
  font-weight: $weight;
  font-display: swap;
}" >> $CSS_FILE

      echo "${STI} Converted $font to $woff2_file ${STE}"
    fi
  done

# Remove binary files from history
elif [ $1 = clean ]
then

  NAME=$(basename "$PWD")
  REPO=https://github.com/seacomoseo/$NAME.git
  # clone-repo
  git clone --mirror "$REPO" clean-repo
  # go to clean-repo
  cd clean-repo
  # remove media and static files
  git filter-repo --path assets/media --path static --invert-paths --force
  # update remote repo
  git remote add origin "$REPO"
  git push --force --all
  git push --force --tags
  # go to parent
  cd ..
  # pull
  git fetch origin
  git reset --hard origin/master
  # remove clean-repo
  rm -rf clean-repo

  sh do up

  echo "${STI} FORCE PUSH ${STE}"
  git push origin --force --all

# COMMANDS FOR DEPLOY

# Like purge CSS
elif [ $1 = css-purge ]
then

  echo "${STI} CSS PURGE ${STE}"
  node ./themes/sansoul/css-purge.js

# Check yaml error of Static CMS
elif [ $1 = yml ]
then

  cd ../_tools
  node others/check-yaml.js $PROYECT
  cd ../$PROYECT

# Get data of place by Google API
elif [ $1 = places ]
then

  COLOR=$(awk '/main:/ {found=1} found && /color:/ {gsub(/'\''/, "", $2); print $2; exit}' ./data/styles.yml)
  LANGS=$(grep 'lang:' data/config.yml | awk -F': ' '{print $2}')
  cd ../_tools
  for LANG in $LANGS; do
    node others/fetch-place.js $PROYECT $COLOR $LANG $2
  done
  cd ../$PROYECT

# Scrap reviews by Google Maps
elif [ $1 = reviews ]
then

  COLOR=$(awk '/main:/ {found=1} found && /color:/ {gsub(/'\''/, "", $2); print $2; exit}' ./data/styles.yml)
  LANGS=$(grep 'lang:' data/config.yml | awk -F': ' '{print $2}')
  cd ../_tools
  for LANG in $LANGS; do
    node others/scrape-reviews.js $PROYECT $LANG $2
  done
  cd ../$PROYECT

# Purge svg draws for online (when up to git)
elif [ $1 = draws-purge ]
then

  echo "${STI} DRAWS PURGE ${STE}"
  FILE=public/draws.svg
  TEMP=temp.svg
  IDSF=ids.txt
  # Collect id's
  find ./public/ -type f -iname "*.*" | \
    xargs grep -Eoh "draws.svg\#(\w|-|\.)+" | \
    sort | \
    uniq | \
    sed -E 's/^draws\.svg#|-(pr|ne)x?y?$//g' | \
    tr "\n" "|" | \
    sed -E 's/\|$//g' > \
    ${IDSF}
  IDS=`cat ${IDSF}`
  # Filter original file
  head -n 2 ${FILE} > ${TEMP}
  cat ${FILE} | \
    grep -Eo "^<(symbol|g) id=\"(${IDS})\".+$" >> \
    ${TEMP}
  echo "</svg>" >> ${TEMP}
  # Replace original with filtered
  cat ${TEMP} > \
    ${FILE}
  # If it has no content paint "null"
  [ -s ${FILE} ] || echo "null" > ${FILE}
  # Delete temporary files
  rm ${TEMP} ${IDSF}

# Enter in to prebuild folder, build hugo and go back
elif [ $1 = prebuild ]
then

  hugo version

  echo "${STI} GO SANSOUL PREBUILD ${STE}"
  cd themes/sansoul/prebuild

  echo "${STI} REMOVE PUBLIC DIRECTORIE ${STE}"
  rm -r public

  echo "${STI} RUN HUGO PREBUILD ${STE}"
  hugo --config ../../../hugo.yml,hugo.yml

  echo "${STI} GO PROJECT ${STE}"
  cd ../../..

# # If multilang, copy 404 file in root
# elif [ $1 = multilang ]
# then

#   lang=$(grep '^defaultContentLanguage:' ./data/langs.yml | awk '{print $2}' || echo 'es')
#   lang=${lang:-es}
#   if [ -e "./public/${lang}/404.html" ]
#   then
#     echo "${STI} MULTILANG: COPY 404 FILE IN ROOT ${STE}"
#     cp ./public/${lang}/404.html ./public/
#   fi

# Hugo build as developement environement
elif [ $1 = hugo-development ]
then

  sh do rm-public
  sh do prebuild

  # remove cache directories
  rm -rf public resources

  echo "${STI} RUN HUGO DEVELOPMENT ${STE}"
  hugo --gc --buildFuture --environment development --config themes/sansoul/hugo.default.yml,themes/sansoul/prebuild/public/hugo.prebuild.yml,hugo.yml

# Hugo build as production environement
elif [ $1 = hugo-production ]
then

  sh do rm-public
  sh do prebuild

  echo "${STI} COPY FILES FROM SANSOUL TO PROJECT ${STE}"
  cp ./themes/sansoul/package.json ./
  cp ./themes/sansoul/postcss.config.js ./

  echo "${STI} RUN HUGO PRODUCTION ${STE}"
  hugo --config themes/sansoul/hugo.default.yml,themes/sansoul/hugo.production.yml,themes/sansoul/prebuild/public/hugo.prebuild.yml,hugo.yml

  # sh do css-purge
  sh do draws-purge
  # sh do multilang

# Hugo check environement
elif [ $1 = hugo ]
then

  # Deploy with environement
  development=$(grep '^\s\sdevelopment:' ./data/config.yml | awk '{print $2}')
  if test "$development" = "true"
  then
    sh do hugo-development
  else
    sh do hugo-production
  fi

# CMS + hugo local
elif [ $1 = local ]
then

  export HUGO_CMS_LOCAL=true
  npx @staticcms/proxy-server &
  sh do server

else

  echo "'$1' no es un parámetro válido"

fi