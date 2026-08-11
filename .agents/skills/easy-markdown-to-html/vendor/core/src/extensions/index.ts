// Headless-safe extension set for easy-markdown-to-html.
// The three diagram extensions (mermaid / plantuml / infographic) require a
// browser DOM (mermaid crashes the process in Node via unhandled rejection;
// plantuml/infographic only emit async loading placeholders headlessly).
// They are excluded here so rendering is deterministic. Diagram rendering is a
// v2 enhancement (e.g. headless Chrome like baoyu-post-to-wechat).
export * from './alert'
export * from './component'
export * from './footnotes'
export * from './katex'
export * from './markup'
export * from './ruby'
export * from './slider'
export * from './toc'
