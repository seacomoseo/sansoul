// static/js/fixedsearch.js
/* --------------------------------------------------------------
fixedsearch — Super fast, client side search for Hugo.io with Fusejs.io
based on https://gist.github.com/cmod/5410eae147e4318164258742dd053993
-------------------------------------------------------------- */

(function () {
  const searchForm = document.getElementById('search__form') // search form
  const searchInput = document.getElementById('search__input') // input box for search
  const searchSubmit = document.getElementById('search__submit') // form submit button
  const searchResults = document.getElementById('search__results') // targets the <ul>
  let fuse // holds our search engine
  let searchFocus = false // check to true to make visible by default
  let resultsAvailable = false // did we get any search results?
  let firstRun = true // allow us to delay loading json data unless search activated
  let first = searchResults.firstChild // first child of search list
  let last = searchResults.lastChild // last child of search list

  searchForm.classList.remove('noscript') // JavaScript is active
  searchForm.setAttribute('data-focus', searchFocus)

  /* --------------------------------------------------------------
  The main keyboard event listener running the show
  -------------------------------------------------------------- */
  document.addEventListener('keydown', function (e) {
    // console.log(event); // DEBUG
    // Ctrl + / to show or hide Search
    // if (event.metaKey && event.which === 191) {
    // eslint-disable-next-line
    if (event.ctrlKey && event.which === 191) {
      searchToggleFocus(e) // toggle visibility of search box
    }
  })

  /* --------------------------------------------------------------
  The main keyboard event listener running the show
  -------------------------------------------------------------- */
  searchForm.addEventListener('keydown', function (e) {
    // Allow ESC (27) to close search box
    if (e.keyCode === 27) {
      searchFocus = true // make sure toggle removes focus
      searchToggleFocus(e)
    }

    // DOWN (40) arrow
    if (e.keyCode === 40) {
      if (resultsAvailable) {
        e.preventDefault() // stop window from scrolling
        if (document.activeElement === searchInput) first.focus() // if the currently focused element is the main input --> focus the first <li>
        else if (document.activeElement === last) first.focus() // if we're at the bottom, loop to the start
        // else if ( document.activeElement === last ) last.focus() // if we're at the bottom, stay there
        else document.activeElement.parentElement.nextSibling.firstElementChild.focus() // otherwise select the next search result
      }
    }

    // UP (38) arrow
    if (e.keyCode === 38) {
      if (resultsAvailable) {
        e.preventDefault() // stop window from scrolling
        if (document.activeElement === searchInput) searchInput.focus() // If we're in the input box, do nothing
        else if (document.activeElement === first) searchInput.focus() // If we're at the first item, go to input box
        else document.activeElement.parentElement.previousSibling.firstElementChild.focus() // Otherwise, select the search result above the current active one
      }
    }

    // Use Enter (13) to move to the first result
    if (e.keyCode === 13) {
      if (resultsAvailable && document.activeElement === searchInput) {
        e.preventDefault() // stop form from being submitted
        first.focus()
      }
    }

    // Use Backspace (8) to switch back to the search input
    if (e.keyCode === 8) {
      if (document.activeElement !== searchInput) {
        e.preventDefault() // stop browser from going back in history
        searchInput.focus()
      }
    }
  })

  /* --------------------------------------------------------------
  Load our json data and builds fuse.js search index
  -------------------------------------------------------------- */
  searchForm.addEventListener('focusin', function (e) {
    searchInit() // try to load the search index
  })

  /* --------------------------------------------------------------
  Make submit button toggle focus
  -------------------------------------------------------------- */
  searchForm.addEventListener('submit', function (e) {
    searchToggleFocus(e)
    e.preventDefault()
    return false
  })

  /* --------------------------------------------------------------
  Remove focus on blur
  -------------------------------------------------------------- */
  searchForm.addEventListener('focusout', function (e) {
    if (e.relatedTarget === null) {
      searchToggleFocus(e)
    } else if (e.relatedTarget.type === 'submit') {
      e.stopPropagation()
    }
  })

  /* --------------------------------------------------------------
  Toggle focus UI of form
  -------------------------------------------------------------- */
  function searchToggleFocus (e) {
    // console.log(e); // DEBUG
    // order of operations is very important to keep focus where it should stay
    if (!searchFocus) {
      searchSubmit.innerHTML = '{{ partial "components/icon" (dict "icon" "xmark") }}'
      searchForm.setAttribute('data-focus', true)
      searchInput.focus() // move focus to search box
      searchFocus = true
    } else {
      searchSubmit.innerHTML = '{{ partial "components/icon" (dict "icon" "magnifying-glass" "emoji" "🔍") }}'
      searchForm.setAttribute('data-focus', false)
      document.activeElement.blur() // remove focus from search box
      searchFocus = false
    }
  }

  /* --------------------------------------------------------------
  Fetch some json without jquery
  -------------------------------------------------------------- */
  function fetchJSON (path, callback) {
    // eslint-disable-next-line
    const httpRequest = new XMLHttpRequest()
    httpRequest.onreadystatechange = function () {
      if (httpRequest.readyState === 4) {
        if (httpRequest.status === 200) {
          const data = JSON.parse(httpRequest.responseText)
          if (callback) callback(data)
        }
      }
    }
    httpRequest.open('GET', path)
    httpRequest.send()
  }

  /* --------------------------------------------------------------
  Load script
  based on https://stackoverflow.com/a/55451823
  -------------------------------------------------------------- */
  function loadScript (url) {
    return new Promise(function (resolve, reject) {
      const script = document.createElement('script')
      script.onerror = reject
      script.onload = resolve
      if (document.currentScript) {
        document.currentScript.parentNode.insertBefore(script, document.currentScript)
      } else {
        document.head.appendChild(script)
      }
      script.src = url
    })
  }

  /* --------------------------------------------------------------
  Load our search index, only executed once
  on first call of search box (Ctrl + /)
  -------------------------------------------------------------- */
  function searchInit () {
    if (firstRun) {
      loadScript(window.location.origin + '/js/fuse.js').then(() => {
        searchInput.value = '' // reset default value
        firstRun = false // let's never do this again
        fetchJSON('{{ site.Home.RelPermalink }}index.json', function (data) {
          const options = { // fuse.js options; check fuse.js website for details
            shouldSort: true,
            location: 0,
            distance: 100,
            threshold: 0.4,
            minMatchCharLength: 2,
            keys: [
              'link',
              'title',
              'date',
              'summary',
              'content',
              'reading_time',
              'type',
              'type_label',
              'category',
              'author',
              'image'
            ]
          }

          // eslint-disable-next-line
          fuse = new Fuse(data, options) // build the index from the json file

          searchInput.addEventListener('keyup', function (e) { // execute search as each character is typed
            searchExec(this.value)
          })
          // console.log("index.json loaded"); // DEBUG
        })
      }).catch((error) => { console.log('fixedsearch failed to load: ' + error) })
    }
  }

  /* --------------------------------------------------------------
  Using the index we loaded on Ctrl + /, run
  a search query (for "term") every time a letter is typed
  in the search box
  -------------------------------------------------------------- */
  function searchExec (term) {
    const results = fuse.search(term) // the actual query being run using fuse.js
    let searchItems = '' // our results bucket

    if (results.length === 0) { // no results based on what was typed into the input box
      resultsAvailable = false
      searchItems = '{{ i18n "search_no_results" }}'
    } else { // build our html
      for (const item in results.slice(0, 5)) { // only show first 5 results
        let searchItemImage = ''
        let searchItemText = ''
        let searchItemType = ''
        let searchItemAuthor = ''
        let searchItemReadingTime = ''
        if (results[item].item.image) {
          searchItemImage = `<picture class="image__inner"><img src="${results[item].item.image}"></picture>`
        }
        if (results[item].item.summary) {
          searchItemText = `<div class="content content--small">${results[item].item.summary}</div>`
        }
        if (results[item].item.date) {
          searchItemType = `
            <time class="box__tag">
              {{ partial "components/icon" (dict "class" "box__tag-icon" "icon" "calendar" "emoji" "📅") }}
              ${results[item].item.date}
            </time>`
        } else {
          searchItemType = `
            <i class="box__tag">
              <svg class="box__tag-icon"><use href="/draws.svg#${results[item].item.icon}"></use></svg>
              ${results[item].item.type_label}
            </i>`
        }
        if (results[item].item.author) {
          searchItemAuthor = `
            <i class="box__tag">
              {{ partial "components/icon" (dict "class" "box__tag-icon" "icon" "user" "emoji" "👤") }}
              ${results[item].item.author}
            </i>`
        }
        if (results[item].item.reading_time !== '0 minutos' && results[item].item.reading_time !== '') {
          searchItemReadingTime = `
            <div class="box__tags">
              <i class="box__tag">
              {{ partial "components/icon" (dict "class" "box__tag-icon" "icon" "clock" "emoji" "🕓") }}
                ${results[item].item.reading_time}
              </i>
            </div>`
        }
        searchItems = searchItems +
          `
          {{- $list   := site.Params.list -}}
          {{- $styles := site.Data.styles -}}
          <article
            class="
              search__result-item
              box
              box--button-hide
              bg bg-{{ $list.color }}
              align-{{ $list.align | default "left" -}}
            "
            data-h
          >
            <a class="search__result-item-link" href="${results[item].item.link}"></a>

            {{- if $styles.buttons.deep | and $list.color -}}
              <div class="bg-color bg-color--3d"></div>
            {{- end -}}
            <div class="bg-color"></div>

            <div
              class="
                image
                image--inset
                {{ print "image--" ($list.ratio | default "16x9") }}
                {{ cond (not $list.contain) "" "image--contain" }}
                {{ cond (ne $list.image "gradient") "" "image--gradient" }}
              "
            >
              ${searchItemImage}
            </div>
            <p class="box__title box__title--link h6">
              <i class="box__link" data-h><i>${results[item].item.title}</i></i>
            </p>
            ${searchItemText}
            <div class="box__tags">
              ${searchItemType}
              ${searchItemAuthor}
            </div>
            ${searchItemReadingTime}
        </article>`
      }
      resultsAvailable = true
    }

    searchResults.innerHTML = searchItems
    if (results.length > 0) {
      first = searchResults.firstChild.firstElementChild // first result container — used for checking against keyboard up/down location
      last = searchResults.lastChild.firstElementChild // last result container — used for checking against keyboard up/down location
    }
  }
}())
