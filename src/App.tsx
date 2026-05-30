import { useState, useCallback, useEffect, useRef } from 'react';
import type { Message, ToolLampState, ImageAttachment, ImageSsePayload } from './types';
import { clearConversationHistory, fetchConversationHistory, sendMessageStream, stopAgent } from './api';
import type { RawSseEvent } from './api';
import { I18nProvider, LangToggle, useT, MessageKeys } from './i18n';
import {
  base64ToBlob,
  saveImage,
  loadConversationImages,
  deleteConversationImages,
  createObjectUrl,
  revokeAllObjectUrls,
  makeStorageKey,
} from './lib/imageStore';
import { saveSnapshot, loadSnapshot, deleteSnapshot } from './lib/chatUiStore';
import ToolIndicators from './components/ToolIndicators';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import DebugPanel from './components/DebugPanel';
import CodeViewer from './components/CodeViewer';
import styles from './App.module.css';

const LAMP_IDS = ['commands', 'files', 'code_interpreter', 'browser'] as const;
const LAMP_ICONS: Record<string, string> = {
  commands: '⌨️',
  files: '📁',
  code_interpreter: '🐍',
  browser: '🌐',
};
const LAMP_I18N_KEYS: Record<string, string> = {
  commands: 'tool.commands',
  files: 'tool.files',
  code_interpreter: 'tool.codeRunner',
  browser: 'tool.browser',
};

const CONVERSATION_ID_STORAGE_KEY = 'eo_conversation_id';

/** Returns existing conversation ID from localStorage, or null if first visit */
function getExistingConversationId(): string | null {
  return localStorage.getItem(CONVERSATION_ID_STORAGE_KEY);
}

/** Returns existing or creates a new conversation ID */
function getOrCreateConversationId(): string {
  const cached = getExistingConversationId();
  if (cached) return cached;

  const conversationId = crypto.randomUUID();
  localStorage.setItem(CONVERSATION_ID_STORAGE_KEY, conversationId);
  return conversationId;
}

function isWebSearchToolEvent(event: RawSseEvent): boolean {
  if (event.eventType !== 'tool_called' || !event.data || typeof event.data !== 'object') {
    return false;
  }
  const tool = (event.data as { tool?: unknown }).tool;
  return tool === 'web_search' || tool === 'browser';
}

function isWebSearchSkillEvent(event: RawSseEvent): boolean {
  if (event.eventType !== 'skill_loaded' || !event.data || typeof event.data !== 'object') {
    return false;
  }
  return (event.data as { name?: unknown }).name === 'web-search';
}

// Module-level dedup flag — outside React lifecycle, unaffected by StrictMode
let _historyFetchInFlight = false;

export default function App() {
  return (
    <I18nProvider>
      <LangToggle />
      <AppInner />
    </I18nProvider>
  );
}

function AppInner() {
  const { t } = useT();

  const buildLamps = useCallback((): ToolLampState[] => LAMP_IDS.map(id => ({
    id,
    label: t(LAMP_I18N_KEYS[id] as MessageKeys),
    icon: LAMP_ICONS[id],
    active: false,
    animKey: 0,
  })), [t]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [lamps, setLamps]       = useState<ToolLampState[]>(buildLamps);
  const [loading, setLoading]   = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<'code' | 'debug'>('code');

  // Update lamp labels when language changes
  useEffect(() => {
    setLamps(prev => prev.map(l => ({
      ...l,
      label: t(LAMP_I18N_KEYS[l.id] as MessageKeys),
    })));
  }, [t]);

  const [debugEvents, setDebugEvents] = useState<RawSseEvent[]>([]);

  const botMsgIdRef = useRef<string>('');
  const abortCtrlRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string>(getOrCreateConversationId());

  // Guard: don't overwrite snapshot during initial restore phase.
  // Only start persisting once user has interacted (sent a message).
  const initDoneRef = useRef(false);

  // Persist UI snapshot whenever messages change (debounced)
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (messages.length === 0) return;
    if (!initDoneRef.current) return; // Skip snapshot save during restore phase

    if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    snapshotTimerRef.current = setTimeout(() => {
      saveSnapshot(conversationIdRef.current, messages);
    }, 500);

    return () => {
      if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    };
  }, [messages]);

  // Load history: merge backend text history with local UI snapshot for image refs
  useEffect(() => {
    // First visit: no existing conversation → skip history fetch for instant load
    if (!getExistingConversationId()) {
      setHistoryLoading(false);
      return;
    }

    if (_historyFetchInFlight) return;
    _historyFetchInFlight = true;

    const convId = conversationIdRef.current;

    Promise.all([
      fetchConversationHistory(convId),
      loadSnapshot(convId),
      loadConversationImages(convId),
    ]).then(([history, snapshot, storedImages]) => {
      // Build a map of imageId → blob URL from IndexedDB
      const imageUrlMap = new Map<string, { url: string; mimeType: string; size: number; storageKey: string }>();
      for (const record of storedImages) {
        const url = createObjectUrl(record.storageKey, record.blob);
        imageUrlMap.set(record.imageId, {
          url,
          mimeType: record.mimeType,
          size: record.size,
          storageKey: record.storageKey,
        });
      }

      // Rebuild blob: URLs for snapshot image attachments
      function rebuildImages(images: Message['images']): Message['images'] {
        if (!images || images.length === 0) return images;
        return images.map(img => {
          if (typeof img === 'string') return img;
          const urlInfo = imageUrlMap.get(img.id);
          return urlInfo ? { ...img, url: urlInfo.url, persistent: true } : img;
        });
      }

      let merged: Message[];

      if (snapshot.length > 0) {
        // Snapshot is the authoritative UI source (contains image refs).
        // Rebuild blob: URLs from IndexedDB for each image attachment.
        merged = snapshot.map(msg => ({
          ...msg,
          images: rebuildImages(msg.images),
        }));
      } else if (history.length > 0) {
        // No local snapshot: fall back to backend history (text only, no images).
        merged = history;
      } else {
        merged = [];
      }

      if (merged.length > 0) {
        setMessages(merged);
      }
    }).finally(() => {
      _historyFetchInFlight = false;
      setHistoryLoading(false);
    });
  }, []);

  /** Update the current bot message's content via an updater function. */
  const updateBotMessage = useCallback((updater: (content: string) => string) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === botMsgIdRef.current
          ? { ...m, content: updater(m.content) }
          : m
      )
    );
  }, []);

  const setBotActivity = useCallback((activity: Message['activity']) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === botMsgIdRef.current
          ? { ...m, activity }
          : m
      )
    );
  }, []);

  const finishBotActivity = useCallback(() => {
    setMessages(prev => {
      let changed = false;
      const next = prev.map(m => {
        if (m.id === botMsgIdRef.current && m.activity?.status === 'active') {
          changed = true;
          return { ...m, activity: { ...m.activity, status: 'done' as const } };
        }
        return m;
      });
      return changed ? next : prev;
    });
  }, []);

  /** Handle an incoming image SSE event: persist to IndexedDB and append ref to message. */
  const handleImageEvent = useCallback(async (payload: ImageSsePayload) => {
    const { imageId, base64, mimeType = 'image/png', size } = payload;
    const convId = conversationIdRef.current;
    const msgId = botMsgIdRef.current;
    const storageKey = makeStorageKey(convId, imageId);

    // Decode once — reused by both success and fallback paths
    const blob = base64ToBlob(base64, mimeType);
    const actualSize = size || blob.size;
    let persistent = false;

    try {
      await saveImage({
        conversationId: convId,
        messageId: msgId,
        imageId,
        blob,
        mimeType,
      });
      persistent = true;
    } catch (e) {
      console.warn('[image] IndexedDB save failed, using temporary URL:', e);
    }

    // Create runtime URL (persistent uses managed cache, fallback uses raw objectURL)
    const url = persistent
      ? createObjectUrl(storageKey, blob)
      : URL.createObjectURL(blob);

    const attachment: ImageAttachment = {
      id: imageId,
      storageKey,
      url,
      mimeType,
      size: actualSize,
      createdAt: Date.now(),
      persistent,
    };

    setMessages(prev =>
      prev.map(m =>
        m.id === msgId
          ? { ...m, images: [...(m.images || []), attachment] }
          : m
      )
    );
  }, []);

  const finishStream = useCallback(() => {
    setLoading(false);
    abortCtrlRef.current = null;
  }, []);

  const handleSend = useCallback(async (text: string) => {
    // User has interacted — allow snapshot persistence from now on
    initDoneRef.current = true;
    setRightPanelMode('debug');

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const botMsgId = crypto.randomUUID();
    botMsgIdRef.current = botMsgId;
    const botMsg: Message = {
      id: botMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg, botMsg]);
    setLoading(true);

    const ctrl = sendMessageStream(text, {
      onTextDelta(delta) {
        finishBotActivity();
        updateBotMessage(content => content + delta);
      },

      onToolCalled(toolName) {
        if (toolName === 'web_search' || toolName === 'browser') {
          setBotActivity({ type: 'web_search', label: 'Web searching...', status: 'active' });
        }

        setLamps(prev =>
          prev.map(l =>
            l.id === toolName
              ? { ...l, active: true, animKey: l.animKey + 1 }
              : l
          )
        );
        setTimeout(() => {
          setLamps(prev =>
            prev.map(l => (l.id === toolName ? { ...l, active: false } : l))
          );
        }, 1000);
      },

      onImage(payload) {
        finishBotActivity();
        handleImageEvent(payload);
      },

      onRawEvent(event) {
        if (isWebSearchSkillEvent(event)) {
          setBotActivity({ type: 'web_search', label: 'Web searching...', status: 'active' });
        } else if (!isWebSearchToolEvent(event)) {
          finishBotActivity();
        }
        if (event.eventType === 'text_delta') return;
        setRightPanelMode('debug');
        setDebugEvents(prev => [...prev, event]);
        if (event.eventType === 'skills_available' || event.eventType === 'skill_loaded') {
          setSkillsLoading(true);
          setTimeout(() => setSkillsLoading(false), 2000);
        }
      },

      onDone() {
        finishBotActivity();
        finishStream();
      },

      onError() {
        finishBotActivity();
        updateBotMessage(content => content || t("status.error"));
        finishStream();
      },
    }, conversationIdRef.current, { userMsgId: userMsg.id, botMsgId });

    abortCtrlRef.current = ctrl;
  }, [updateBotMessage, setBotActivity, finishBotActivity, handleImageEvent, finishStream, t]);

  const handleClearHistory = useCallback(() => {
    const oldConvId = conversationIdRef.current;

    // Clear backend history for the old conversation without blocking local UI reset.
    clearConversationHistory(oldConvId).then(ok => {
      if (!ok) {
        console.warn('[history] backend clear request failed');
      }
    });

    // Cleanup IndexedDB images and UI snapshot for old conversation
    revokeAllObjectUrls();
    deleteConversationImages(oldConvId).catch(() => {});
    deleteSnapshot(oldConvId).catch(() => {});

    localStorage.removeItem(CONVERSATION_ID_STORAGE_KEY);
    const newId = crypto.randomUUID();
    localStorage.setItem(CONVERSATION_ID_STORAGE_KEY, newId);
    conversationIdRef.current = newId;
    setMessages([]);
    setDebugEvents([]);
    setRightPanelMode('code');
  }, []);

  const handleStop = useCallback(() => {
    // 1. Immediately abort frontend SSE read
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
      abortCtrlRef.current = null;
    }

    // 2. Optimistic UI: show stopped immediately without waiting for backend
    finishBotActivity();
    updateBotMessage(content => content ? content + '\n\n' + t("status.stopped") : t("status.stopped"));
    setLoading(false);

    // 3. Backend abort async — notify user on failure
    stopAgent(conversationIdRef.current).then(ok => {
      if (!ok) {
        updateBotMessage(content => content + '\n\n' + t("status.backendError"));
      }
    });
  }, [finishBotActivity, updateBotMessage, t]);

  return (
    <div className={styles.shell}>
      <div className={styles.blob1} />
      <div className={styles.blob2} />

      <div className={styles.stage}>
        <div className={styles.chatPanel}>
          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <span className={styles.logo}>⬡</span>
              <div>
                <p className={styles.title}>{t("app.title")}</p>
                <p className={styles.subtitle}>{t("app.subtitle")}</p>
              </div>
            </div>
            <ToolIndicators lamps={lamps} />
            {skillsLoading && <span className={styles.skillsLoading}>loading skills...</span>}
          </header>

          <div className={styles.chatWindowShell}>
            <ChatWindow messages={messages} loading={loading} />
            {historyLoading && messages.length === 0 && (
              <div className={styles.historyOverlay}>
                <div className={styles.historySpinner} />
              </div>
            )}
          </div>
          <ChatInput onSend={handleSend} onStop={handleStop} onClear={handleClearHistory} disabled={loading} />
        </div>

        <div className={styles.codePanel}>
          {rightPanelMode === 'code' ? (
            <CodeViewer />
          ) : (
            <DebugPanel events={debugEvents} onClear={() => setDebugEvents([])} />
          )}
        </div>
      </div>
    </div>
  );
}
