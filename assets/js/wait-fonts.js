export function waitFonts () {
  return document.fonts?.ready || Promise.resolve()
}
