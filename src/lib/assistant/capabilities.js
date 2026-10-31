import { ASSISTANT_ACTION_CATALOG, getAssistantTools } from './actionCatalog.js'

// Compatibility exports for existing model callers. Definitions now come
// from the shared catalog so the router and model receive the same actions.
export const BLOSSOM_LOCAL_TOOLS = getAssistantTools()
export { ASSISTANT_ACTION_CATALOG }
