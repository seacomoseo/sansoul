let observer = new MutationObserver(mutations => {

  let fileLinks = document.querySelectorAll('[class*="FileLinks"]')
  if (fileLinks) {
    fileLinks.forEach(e => {
      console.log(e)

      let src = e.innerText;

      if (src.match(/poster\=/g)) {
        src = '/media/' + src.replace(/^.+?poster\=([\w\d\.-]+).*$/, `$1`);
        setStyle(e, src)
      } else if (src.match(/youtu\.be|youtube(-nocookie)?\.com/g)) {
        src =
          'https://i3.ytimg.com/vi_webp/' +
          src.replace(/^.+?(v=|be\/)(.+?)(&|\?|$).*/g, '$2') +
          '/mqdefault.webp';
        setStyle(e, src)
      } else if (src.match(/vimeo\.com/g)) {
        src =
          'https://vumbnail.com/' +
          src.replace(/^.+?com\/(.+?)(\?|$)/g, '$1') +
          '_medium.jpg';
        setStyle(e, src)
      } else if (src.match(/\.(mp4|mov|avi|webm)/g)) {
        const extensionsToTry = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];

        for (const ext of extensionsToTry) {
          const potentialSrc = '/media/' + src.replace(/\.(mp4|mov|avi|webm)/g, `.${ext}`);
          const imageExists = checkImage(potentialSrc);
          if (imageExists) {
            setStyle(e, potentialSrc)
            break;
          }
        }
      } else {
        src = '/media/' + src;
        setStyle(e, src)
      }

      function setStyle(e, src) {
        const newStyle = `--image: url(${src})`;
        const getStyle = e.getAttribute('style');
        if (!getStyle || getStyle !== newStyle) {
          e.setAttribute('style', newStyle);
        }
      }
      function checkImage(url) {
        return fetch(location.origin + url)
          .then(response => response.status === 200)
          .catch(() => false);
      }
    })
  }

  let cardText = document.querySelectorAll('[class*="CardImageWrapper"] > [src^="blob:"]')
  if (cardText) {
    cardText.forEach(e => {
      const src = e.parentElement.nextElementSibling.innerText
      if (src.match(/\.(jpe?g|png|gif|webp)$/g)) {
        e.src = '/media/' + src
      }
    })
  }

})

observer.observe(document.body, {
  childList: true,
  subtree: true
})