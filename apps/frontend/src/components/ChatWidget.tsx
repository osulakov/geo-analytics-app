import { useEffect, useRef, useState, type FormEvent } from 'react';
import { observer } from 'mobx-react-lite';

import { useStores } from '../stores/StoreContext';

/**
 * Top-left AI messenger panel. Collapsed to just an input field by default;
 * expands on the chevron or when the first message is sent.
 */
export const ChatWidget = observer(function ChatWidget() {
  const { chat } = useStores();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the latest message in view while expanded.
  useEffect(() => {
    const list = listRef.current;
    if (list && chat.expanded) list.scrollTop = list.scrollHeight;
  }, [chat.messages.length, chat.expanded]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    chat.sendMessage(draft);
    setDraft('');
  };

  return (
    <aside className={`chat-widget${chat.expanded ? '' : ' is-collapsed'}`}>
      {chat.expanded && (
        <div className="chat-widget__messages" ref={listRef}>
          {chat.messages.map((message) => (
            <div key={message.id} className={`chat-message chat-message--${message.role}`}>
              {message.text}
            </div>
          ))}
        </div>
      )}

      <form className="chat-widget__input" onSubmit={handleSubmit}>
        <button
          type="button"
          className="chat-widget__toggle"
          onClick={() => chat.toggleExpanded()}
          aria-expanded={chat.expanded}
          aria-label={chat.expanded ? 'Collapse chat' : 'Expand chat'}
        >
          <svg
            className="chat-widget__chevron"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask Elements"
          aria-label="Ask Elements"
        />
        <button type="submit" aria-label="Send" disabled={draft.trim().length === 0}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.993.993 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
          </svg>
        </button>
      </form>
    </aside>
  );
});
