import { useEffect, useRef } from 'react';
import type { RawSseEvent } from '../api';
import styles from './DebugPanel.module.css';

interface Props {
  events: RawSseEvent[];
  onClear: () => void;
}

export default function DebugPanel({ events, onClear }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.dot} />
          <span className={styles.title}>SSE Debug</span>
          <span className={styles.count}>{events.length} events</span>
        </div>
        <button className={styles.clearBtn} onClick={onClear}>Clear</button>
      </div>

      <div className={styles.body} ref={scrollRef}>
        {events.length === 0 && (
          <div className={styles.empty}>
            等待 SSE 事件...<br />
            发送消息后，这里会显示后端返回的所有原始数据。
          </div>
        )}

        {events.map((evt, i) => (
          <div key={i} className={styles.event}>
            <div className={styles.eventHeader}>
              <span className={`${styles.eventType} ${styles[`type_${evt.eventType}`] || styles.type_unknown}`}>
                {evt.eventType}
              </span>
              <span className={styles.eventTime}>
                {new Date(evt.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            <pre className={styles.eventData}>
              {typeof evt.data === 'object'
                ? JSON.stringify(evt.data, null, 2)
                : evt.raw}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
