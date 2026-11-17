/**
 * Pull the JSON object out of a model reply: models wrap it in ``` fences or
 * add a sentence around it. Returns null when there is no parsable object.
 */
export function parseModelJson(text: string): unknown {
  const unfenced = text.replace(/```(?:json)?/gi, '')
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(unfenced.slice(start, end + 1))
  } catch {
    return null
  }
}
