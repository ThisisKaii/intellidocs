/**
 * The document open in the editor, for code deep in the editor that needs to say which document
 * it works for (a picture upload is stored as that document's, so it counts toward its owner's
 * storage and is removed with the document). Set by the document page while it is open.
 */
let activeDocumentId: string | null = null

export function setActiveDocumentId(documentId: string | null): void {
  activeDocumentId = documentId
}

export function getActiveDocumentId(): string | null {
  return activeDocumentId
}
