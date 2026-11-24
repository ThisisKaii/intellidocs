import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

import { PictureRefusedError, storePicture } from './pictureSlots'

/**
 * A picture pasted from the clipboard (a screenshot, a copied image) is stored like one chosen with
 * Insert Image, and the document points at the stored file.
 *
 * Pasted pictures went in as inline `data:` URLs instead: a few figures made a manuscript tens of
 * megabytes, every save carried them, and saves that large are refused. Clipboard content with text
 * as well (a Word or web selection) is pasted as before.
 */
export const PastePictures = Extension.create({
  name: 'pastePictures',

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey('pastePictures'),
        props: {
          handlePaste(_view, event) {
            const data = event.clipboardData
            if (!data) return false
            const pictures = Array.from(data.files).filter((file) => file.type.startsWith('image/'))
            if (pictures.length === 0) return false
            // Text came along (a copied passage with a picture in it): paste it as it is.
            const html = data.getData('text/html')
            const text = html ? new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '' : data.getData('text/plain')
            if (text.trim()) return false
            event.preventDefault()
            void (async () => {
              for (const file of pictures) {
                try {
                  const src = await storePicture(file)
                  if (src && !editor.isDestroyed) editor.chain().focus().setImage({ src }).run()
                } catch (error) {
                  window.alert(error instanceof PictureRefusedError ? error.message : 'Could not read or upload this image. Please try another file.')
                }
              }
            })()
            return true
          },
        },
      }),
    ]
  },
})
