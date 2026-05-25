import { useEffect, useRef } from 'react';
import type { Message } from '../types';
import ChatBubble from './ChatBubble';
import styles from './ChatWindow.module.css';

interface Props {
  messages: Message[];
  loading: boolean;
}

export default function ChatWindow({ messages, loading }: Props) {
  const windowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // No need to scroll when there is no content
    if (messages.length === 0 && !loading) return;
    // Directly manipulate container scrollTop, only scroll ChatWindow internally
    // Avoid scrollIntoView scrolling all ancestors causing header to disappear
    const el = windowRef.current;
    if (!el) return;
    // Use instant during streaming to avoid jitter from stacked smooth animations; use smooth after
    el.scrollTo({ top: el.scrollHeight, behavior: loading ? 'instant' : 'smooth' });
  }, [messages, loading]);

  return (
    <div ref={windowRef} className={styles.window}>
      {messages.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>⬡</span>
          <p className={styles.emptyTitle}>Claude Agent Starter</p>
          <p className={styles.emptyHint}>
            I'm a Claude assistant running on EdgeOne. I can call sandbox tools, persist session memory, and help you with debugging, file management, code execution, and web browsing.
          </p>
          <p className={styles.emptyFeatures}>
            Sandbox Tools · Store Memory · Observability
          </p>
        </div>
      )}

      {messages.map(msg => (
        <ChatBubble key={msg.id} message={msg} />
      ))}

      {/* Show typing indicator only when loading and assistant message has no content yet */}
      {loading && !(messages.length > 0 && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].content.length > 0) && (
        <div className={styles.typingRow}>
          <div className={styles.avatar}>⬡</div>
          <div className={styles.typing}>
            <span />
            <span />
            <span />
          </div>
        </div>
      )}
    </div>
  );
}
