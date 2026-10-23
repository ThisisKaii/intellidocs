/** Minimal typings for the parts of Paged.js (no bundled types) that IntelliDocs uses. */
declare module 'pagedjs' {
  /** Result of a finished Paged.js render. */
  interface PagedFlow {
    total: number
  }

  /** Renders HTML into paginated @page boxes. */
  export class Previewer {
    constructor(options?: Record<string, unknown>)
    preview(
      content: string | DocumentFragment | Node,
      stylesheets: Array<string | Record<string, string>>,
      renderTo: HTMLElement
    ): Promise<PagedFlow>
  }
}
