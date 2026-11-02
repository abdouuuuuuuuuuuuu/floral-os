/** Extract the JSON error returned by a Supabase Edge Function. */
export async function getFunctionErrorMessage(error, fallback = 'The request could not be completed.') {
  if (!error) return fallback

  let message = error.message || fallback
  try {
    const response = error.context
    const body = response?.clone
      ? await response.clone().json()
      : await response?.json?.()
    if (typeof body?.error === 'string' && body.error.trim()) return body.error.trim()
    if (typeof body?.message === 'string' && body.message.trim()) return body.message.trim()
  } catch {
    // Keep the SDK message when the response isn't JSON or has already been read.
  }

  return message
}
