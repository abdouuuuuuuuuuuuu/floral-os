// Turns technical errors into words staff can act on.
//
// Most of Blossom's own errors are already plain ("Only an owner can receive
// stock") and pass through unchanged. But unexpected failures used to reach
// the screen word for word: "TypeError: Failed to fetch", "JWT expired",
// "new row violates row-level security policy", "duplicate key value
// violates unique constraint …". On a till that reads as "the app is broken".
// The original text is still logged (blossom.log) for diagnosis.

const RULES = [
  {
    test: /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|err_network|err_connection|timeouterror|signal timed out|the operation timed out|aborterror|the user aborted/i,
    text: 'No connection to the server. Check the internet, then try again.',
  },
  {
    test: /jwt expired|invalid jwt|jwt.*(malformed|invalid)|refresh token|invalid claim|not authenticated|auth session missing|session.*(expired|missing)/i,
    text: 'Your session has expired. Sign in again, then retry.',
  },
  {
    // Match wording only, never bare codes: "Order #42501" must stay as it is.
    test: /row-level security|permission denied for|insufficient_privilege/i,
    text: 'Your account is not allowed to do this. Ask the owner if you need access.',
  },
  {
    test: /duplicate key value|violates unique constraint/i,
    text: 'This already exists. Check for a duplicate, then try again.',
  },
  {
    test: /violates (check|foreign key|not-null) constraint|invalid input syntax|out of range for type|value too long for type/i,
    text: 'Some details are not valid. Check the form, then try again.',
  },
  {
    test: /could not find the function|schema cache|\bPGRST\d{3}\b|relation .* does not exist|column .* does not exist|function .* does not exist/i,
    text: 'This feature is not fully installed on the server yet. Tell the administrator.',
  },
  {
    // A status number counts only when labelled ("HTTP 503", "status code: 502").
    test: /internal server error|bad gateway|service unavailable|gateway time-?out|upstream connect|non-2xx status|\b(?:http|status(?: code)?)\s*:?\s*50[0-4]\b/i,
    text: 'The server had a problem. Wait a moment, then try again.',
  },
  {
    test: /^(TypeError|ReferenceError|SyntaxError|RangeError):|cannot read propert|is not a function|undefined is not|null is not an object/i,
    text: 'Something went wrong in the app. Try again; if it keeps happening, restart Blossom.',
  },
]

/**
 * Returns the message unchanged when it is already readable, or a plain
 * replacement when it is technical. A leading "What failed: " part is kept,
 * e.g. "Failed to update: duplicate key …" → "Failed to update: This already exists…".
 */
export function friendlyMessage(message) {
  const text = String(message ?? '').trim()
  if (!text) return 'Something went wrong. Try again.'
  const rule = RULES.find((candidate) => candidate.test.test(text))
  if (!rule) return text
  const prefix = text.match(/^([^:]{3,60}):\s/)
  const keepPrefix = prefix && !/error|exception|^\w+Error$/i.test(prefix[1]) && !rule.test.test(prefix[1])
  return keepPrefix ? `${prefix[1]}: ${rule.text}` : rule.text
}
