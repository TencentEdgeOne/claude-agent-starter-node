/**
 * Image attachment reference stored in message state.
 * Contains metadata and a runtime blob: URL for rendering.
 * The `url` field is runtime-only — not persisted to IndexedDB snapshots.
 */
export interface ImageAttachment {
  id: string;              // Unique image ID (from SSE payload)
  storageKey: string;      // IndexedDB key: `${conversationId}/${id}`
  url: string;             // Runtime blob: URL (or empty string if not yet loaded)
  mimeType: string;
  size: number;
  createdAt: number;
  persistent: boolean;     // Whether successfully saved to IndexedDB
}

/**
 * SSE image event payload — enriched with metadata.
 * base64 is transmitted once for frontend persistence, then discarded.
 */
export interface ImageSsePayload {
  imageId: string;
  base64: string;
  mimeType?: string;
  size?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  images?: (ImageAttachment | string)[];  // ImageAttachment (new) or base64 string (legacy compat)
  activity?: {
    type: 'web_search';
    label: string;
    status: 'active' | 'done';
  };
}

export interface ToolLampState {
  id: string;
  label: string;
  icon: string;
  active: boolean;
  animKey: number;   // Incremented on each activation to remount and replay animation
}
