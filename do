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

# hugo server with theme config
elif [ $1 = server ]
then

  echo "${STI} HUGO SERVER ${STE}"
  hugo server --config themes/sansoul/hugo.default.yml,hugo.yml

# create woff2 and scss by font files
elif [ $1 = normalize ]
then

  echo "${STI} NORMALIZE YAML AND MARKDOWN FILES ${STE}"
  python3 ../_tools/others/yaml-normalize.py

# create woff2 and scss by font files
elif [ $1 = fonts ]
then

  echo "${STI} GO _TOOLS ${STE}"
  cd ../_tools

  echo "${STI} CHANGE DOMAIN IN GULP FILE ${STE}"
  sed -i ".bak" "s/^const domain = '.*'/const domain = '${PROYECT}'/g" gulpfile.js

  echo "${STI} REMOVE .BAK ${STE}"
  rm *.bak

  echo "${STI} GULP FONTS ${STE}"
  gulp fonts

  echo "${STI} GO PROJECT ${STE}"
  cd "../${PROYECT}"

  echo "${STI} ADD FONT DISPLAY SWAP ${STE}"
  cat static/fonts/*.css | perl -p -e "s/\}/    font-display: swap;\n}\n/gm" > assets/css/_fonts.scss

  echo "${STI} REMOVE FONTS IN CSS EXCEPT WOFF2 ${STE}"
  perl -p0i -e 's/    src: url...fonts.(.*?).eot..;(.|\n)*?;/    src: url("\/fonts\/$1.woff2") format("woff2");/gm' assets/css/_fonts.scss

  echo "${STI} REMOVE FONT FILES EXCEPT WOFF2 ${STE}"
  rm static/fonts/*.{svg,eot,woff,ttf,css}

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

# purge svg draws for online (when up to gitlab)
#    used draws
#      fin all files in public folder
#      xargs: in each
#      grep: get draws.svg#id by regex
#      sort
#      unique
#      sed regex replace: remove draws.svg# prefix
#      join with pipeline
#      sed regex replace: remove last pipeline
#      save in used draws auxiliar file
#    use the used draws auxiliar file like a variable
#    custom draws file
#      cat: get file draws
#      grep: filter only used draws
#      sed: add xml and svg data format in first line
#      sed: add svg close tag in last line
#      save as draws_temp.svg
#    save draws_temp.svg as draws.svg
#    if the file generated is empty, write "null"
#    remove draws_temp.svg and used draws auxiliar file
elif [ $1 = draws-purge ]
then

  echo "${STI} DRAWS PURGE ${STE}"
  PATH_DRAWS=public/draws.svg
  PATH_DRAWS_TEMP=public/draws_temp.svg
  find ./public/ -type f -iname "*.*" | \
    xargs grep -Eoh "draws.svg\#(\w|-|\.)+" | \
    sort | \
    uniq | \
    sed "s/^draws.svg\#//g" | \
    tr "\n" "|" | \
    sed "s/\|$$//g" > \
    USED_DRAWS.txt
  USED_DRAWS=`cat USED_DRAWS.txt`
  cat ${PATH_DRAWS} | \
    grep -Eo "^  <symbol id=\"(${USED_DRAWS})\".*</symbol>" | \
    sed '1s/^/<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http:\/\/www.w3.org\/2000\/svg" style="display: none;">/g' | \
    sed '$s/>$/><\/svg>/g' > \
    ${PATH_DRAWS_TEMP}
  cat ${PATH_DRAWS_TEMP} > \
    ${PATH_DRAWS}
  [ -s ${PATH_DRAWS} ] || echo "null" > ${PATH_DRAWS}
  rm ${PATH_DRAWS_TEMP} USED_DRAWS.txt

# enter in to prebuild folder, build hugo and go back
elif [ $1 = prebuild ]
then

  if [ -e "hugo.prebuild.yml" ]
  then
    echo "${STI} GO SANSOUL PREBUILD ${STE}"
    cd themes/sansoul/prebuild

    echo "${STI} REMOVE PUBLIC DIRECTORIE ${STE}"
    rm -r public

    echo "${STI} RUN HUGO PREBUILD ${STE}"
    hugo --config ../../../hugo.yml,hugo.yml,../../../hugo.prebuild.yml

    echo "${STI} GO PROJECT ${STE}"
    cd ../../..
  fi

# if multilang, copy 404 file in root
elif [ $1 = multilang ]
then

  lang=$(grep '^defaultContentLanguage:' ./hugo.yml | awk '{print $2}')
  if [ -e "./public/${lang}/404.html" ]
  then
    echo "${STI} MULTILANG: COPY 404 FILE IN ROOT ${STE}"
    cp ./public/${lang}/404.html ./public/
  fi

# hugo build in local with theme config
elif [ $1 = hugo-local ]
then

  echo "${STI} HUGO LOCAL ${STE}"
  hugo --config themes/sansoul/hugo.default.yml,themes/sansoul/hugo.production.yml,hugo.yml

# hugo build as developement environement
elif [ $1 = hugo-development ]
then

  hugo version

  sh do prebuild

  echo "${STI} RUN HUGO DEVELOPMENT ${STE}"
  hugo --gc --buildFuture --environment development --config themes/sansoul/hugo.default.yml,hugo.yml

  sh do multilang

# hugo build as production environement
elif [ $1 = hugo-production ]
then

  hugo version

  sh do prebuild

  echo "${STI} COPY FILES FROM SANSOUL TO PROJECT ${STE}"
  cp ./themes/sansoul/package.json ./
  cp ./themes/sansoul/babel.config.js ./
  cp ./themes/sansoul/postcss.config.js ./

  echo "${STI} RUN HUGO PRODUCTION ${STE}"
  hugo --config themes/sansoul/hugo.default.yml,themes/sansoul/hugo.production.yml,hugo.yml

  sh do draws-purge

  sh do multilang

# hugo check environement
elif [ $1 = hugo ]
then

  # Deploy with environement
  development=$(grep '^development:' ./data/config.yml | awk '{print $2}')
  if test "$development" = "true"
  then
    sh do hugo-development
  else
    sh do hugo-production
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