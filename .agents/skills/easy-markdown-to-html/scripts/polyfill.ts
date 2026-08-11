// Headless browser polyfills required by the doocs/md render pipeline in Bun/Node.
// Must be imported BEFORE any @md/* module so globals exist at init time.
// Derived from packages/mcp-server/polyfill.mjs in the doocs/md monorepo.
function noop() {}

const MathJax = {
  texReset() {},
  tex2svg(latex: string) {
    const svgStyle: Record<string, unknown> = {}
    const styleProxy = new Proxy(svgStyle, {
      set(_, prop, value) { svgStyle[prop] = value; return true },
      get(_, prop) {
        if (prop === 'setProperty')
          return (p: string, v: string) => { svgStyle[p] = v }
        if (prop === 'display')
          return svgStyle[prop] || ''
        return svgStyle[prop]
      },
    })
    return {
      firstChild: {
        outerHTML: `<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>${latex.replace(/</g, '&lt;')}</mi></math>`,
        style: styleProxy,
        getAttribute: () => null,
        removeAttribute: noop,
        querySelector: () => null,
      },
    }
  },
}

const win: Record<string, unknown> = {
  MathJax,
  addEventListener: noop,
  removeEventListener: noop,
  dispatchEvent: () => true,
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(cb, 16) as unknown as number,
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
}

const doc: Record<string, unknown> = {
  getElementById: () => null,
  documentElement: { getAttribute: () => null, style: {} },
  createDocumentFragment: () => ({ appendChild: noop, childNodes: [] }),
  querySelectorAll: () => [],
  querySelector: () => null,
  createElement: (tag: string) => ({
    tagName: tag.toUpperCase(),
    setAttribute: noop,
    appendChild: noop,
    innerHTML: '',
    style: {},
  }),
  createTextNode: (text: string) => ({ textContent: text, data: text }),
  body: { appendChild: noop },
  head: { appendChild: noop },
}

;(globalThis as Record<string, unknown>).MathJax = MathJax
;(globalThis as Record<string, unknown>).window = win
;(globalThis as Record<string, unknown>).document = doc
