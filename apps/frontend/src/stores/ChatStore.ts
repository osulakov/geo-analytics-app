import { makeAutoObservable, runInAction } from 'mobx';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: number;
  role: ChatRole;
  text: string;
}

// Placeholder response until the assistant is wired up to a real backend.
const PENDING_REPLY = "Thanks! I'm still getting set up — I'll start working soon.";

export class ChatStore {
  messages: ChatMessage[] = [
    {
      id: 0,
      role: 'assistant',
      text: "Hi, I'm Elements. Ask me anything about what's on the globe.",
    },
  ];

  /** Whether the conversation panel is expanded (collapsed by default). */
  expanded = false;

  private nextId = 1;

  constructor() {
    makeAutoObservable(this);
  }

  setExpanded(expanded: boolean): void {
    this.expanded = expanded;
  }

  toggleExpanded(): void {
    this.expanded = !this.expanded;
  }

  sendMessage(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Sending always opens the conversation.
    this.expanded = true;
    this.messages.push({ id: this.nextId++, role: 'user', text: trimmed });

    // Canned reply for now; swap this for a real request later.
    const replyId = this.nextId++;
    setTimeout(() => {
      runInAction(() => {
        this.messages.push({ id: replyId, role: 'assistant', text: PENDING_REPLY });
      });
    }, 400);
  }
}
