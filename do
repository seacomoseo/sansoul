#!/bin/sh

# variables
PROYECT="${PWD##*/}"
STI="\033[7;37m"
STE="\033[0m"

# COMMANDS FOR PROJECTS

# upload with date now
if [ $1 = up ]
then

  echo "${STI} ADD ${STE}"
  git add .

  echo "${STI} COMMIT ${STE}"
  git commit -m "Update: `date +'%Y-%m-%d %H:%M:%S'`"

  echo "${STI} PUSH ${STE}"
  git push

# upload submodule changes with date now
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

# pull of repository and update the submodules
elif [ $1 = down ]
then

  echo "${STI} PULL ${STE}"
  git pull

  echo "${STI} SUBMODULE UPDATE ${STE}"
  git submodule update --recursive --remote

# pull of repository and update the submodules
elif [ $1 = du ]
then

  echo "${STI} DO DOWN ${STE}"
  sh do down

  echo "${STI} DO UP ${STE}"
  sh do up

# hugo server with theme config
elif [ $1 = server ]
then

  sh do prebuild

  echo "${STI} HUGO SERVER ${STE}"
  hugo server --config themes/sansoul/hugo.default.yml,hugo.yml,themes/sansoul/prebuild/public/langs.yml

# create woff2 and scss by font files
elif [ $1 = normalize ]
then

  echo "${STI} NORMALIZE YAML AND MARKDOWN FILES ${STE}"
  python3 ../_tools/others/yaml-normalize.py

# create woff2 and scss by font files
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

# remove binary files from history
elif [ $1 = clean ]
then

  echo "${STI} REMOVE BINARY FILES FROM HISTORY ${STE}"
  git filter-branch --force --index-filter 'git rm --cached --ignore-unmatch *.ai *.bmp *.eps *.gif *.gifv *.ico *.jng *.jp2 *.jpg *.jpeg *.jpx *.jxr *.png *.psb *.psd *.svgz *.tif *.tiff *.wbmp *.webp *.pdf *.kar *.m4a *.mid *.midi *.mp3 *.ogg *.ra *.wav *.3gpp *.3gp *.as *.asf *.asx *.avi *.fla *.flv *.m4v *.mng *.mov *.mp4 *.mpeg *.mpg *.ogv *.swc *.swf *.webm *.7z *.gz *.jar *.rar *.tar *.zip *.ttf *.eot *.otf *.woff *.woff2 *.exe *.pyc' --prune-empty -- --all

  echo "${STI} DO UP ${STE}"
  sh do up

  echo "${STI} FORCE PUSH ${STE}"
  git push origin --force --all

# COMMANDS FOR DEPLOY

# like purge css
elif [ $1 = css-purge ]
then

  time node ./themes/sansoul/css-purge.js

# like purge css
elif [ $1 = yml ]
then

  time node ./themes/sansoul/check-yaml.js

# purge svg draws for online (when up to git)
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

# enter in to prebuild folder, build hugo and go back
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

# # if multilang, copy 404 file in root
# elif [ $1 = multilang ]
# then

#   lang=$(grep '^defaultContentLanguage:' ./data/langs.yml | awk '{print $2}' || echo 'es')
#   lang=${lang:-es}
#   if [ -e "./public/${lang}/404.html" ]
#   then
#     echo "${STI} MULTILANG: COPY 404 FILE IN ROOT ${STE}"
#     cp ./public/${lang}/404.html ./public/
#   fi

# hugo build in local with theme config
elif [ $1 = hugo-local ]
then

  sh do prebuild

  echo "${STI} HUGO LOCAL ${STE}"
  hugo --config themes/sansoul/hugo.default.yml,themes/sansoul/hugo.production.yml,hugo.yml,themes/sansoul/prebuild/public/langs.yml

# hugo build as developement environement
elif [ $1 = hugo-development ]
then

  sh do prebuild

  # remove cache directories
  rm -rf public resources

  echo "${STI} RUN HUGO DEVELOPMENT ${STE}"
  hugo --gc --buildFuture --environment development --config themes/sansoul/hugo.default.yml,hugo.yml,themes/sansoul/prebuild/public/langs.yml

# hugo build as production environement
elif [ $1 = hugo-production ]
then

  sh do prebuild

  echo "${STI} COPY FILES FROM SANSOUL TO PROJECT ${STE}"
  cp ./themes/sansoul/package.json ./
  cp ./themes/sansoul/postcss.config.js ./

  echo "${STI} RUN HUGO PRODUCTION ${STE}"
  hugo --config themes/sansoul/hugo.default.yml,themes/sansoul/hugo.production.yml,hugo.yml,themes/sansoul/prebuild/public/langs.yml

  sh do draws-purge

  # sh do multilang

# hugo check environement
elif [ $1 = hugo ]
then

  # Deploy with environement
  development=$(grep '^development:' ./data/config.yml | awk '{print $2}')
  if test "$development" = "true"
  then
    time sh do hugo-development
  else
    time sh do hugo-production
  fi

# cms + hugo local
elif [ $1 = local ]
then

  export HUGO_CMS_LOCAL=true
  npx @staticcms/proxy-server &
  sh do server

else

  echo "'$1' no es un parámetro válido"

fi