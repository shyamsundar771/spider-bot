import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";
const CONVERSATION_KEY = "spider_bot_conversation_id";

const WELCOME_MESSAGE = {
  role: "assistant",
  content: "Hello! I'm Spider Bot 🕷️ How can I help you today?",
};

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Could not copy code:", error);
    }
  }

  return (
    <div className="code-block">
      <div className="code-header">
        <span>{language}</span>

        <button
          type="button"
          className="copy-code-button"
          onClick={copyCode}
        >
          {copied ? "Copied!" : "Copy code"}
        </button>
      </div>

      <SyntaxHighlighter
        language={language}
        style={oneDark}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: "0 0 10px 10px",
          fontSize: "0.9rem",
          overflowX: "auto",
        }}
        wrapLongLines={false}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

function MessageContent({ content }) {
  return (
    <div className="message-content markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-([\w+#.-]+)/.exec(
              className || ""
            );

            const code = String(children).replace(/\n$/, "");

            if (match) {
              return (
                <CodeBlock
                  language={match[1]}
                  code={code}
                />
              );
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content || ""}
      </ReactMarkdown>
    </div>
  );
}

function getFriendlyError(error, status) {
  if (!navigator.onLine) {
    return "You are offline. Please check your internet connection.";
  }

  if (status === 429) {
    return "Too many requests. Please wait a moment and try again.";
  }

  if ([502, 503, 504].includes(status)) {
    return "Spider Bot is temporarily unavailable. Please try again shortly.";
  }

  if (status === 401 || status === 403) {
    return "Spider Bot could not authorize the request. Please check the API configuration.";
  }

  if (status === 402) {
    return "The AI service has reached its usage limit. Please try again later.";
  }

  if (error instanceof TypeError) {
    return "Cannot connect to Spider Bot. Please check that the backend is running.";
  }

  return "Sorry, I couldn't process your message. Please try again.";
}

function App() {
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);

  const [conversationId, setConversationId] = useState(
    () => localStorage.getItem(CONVERSATION_KEY)
  );

  const [conversations, setConversations] = useState([]);
  const [activeTitle, setActiveTitle] = useState("New Chat");
  const [openMenuId, setOpenMenuId] = useState(null);

  // Conversation search
  const [searchQuery, setSearchQuery] = useState("");

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [sidebarLoading, setSidebarLoading] = useState(true);

  const messagesEndRef = useRef(null);

  // Stores the active request so Stop can abort it.
  const abortControllerRef = useRef(null);

  async function refreshConversations() {
    try {
      const response = await fetch(`${API_URL}/conversations`);

      if (!response.ok) {
        throw new Error("Could not load conversations");
      }

      const data = await response.json();

      setConversations(
        Array.isArray(data.conversations)
          ? data.conversations
          : []
      );
    } catch (error) {
      console.error("Conversation list loading failed:", error);
    } finally {
      setSidebarLoading(false);
    }
  }

  useEffect(() => {
    refreshConversations();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      if (!conversationId) {
        setMessages([WELCOME_MESSAGE]);
        setActiveTitle("New Chat");
        setHistoryLoading(false);
        return;
      }

      setHistoryLoading(true);

      try {
        const response = await fetch(
          `${API_URL}/chat/${encodeURIComponent(
            conversationId
          )}/history`
        );

        if (!response.ok) {
          throw new Error("History request failed");
        }

        const data = await response.json();

        if (cancelled) return;

        setMessages(
          Array.isArray(data.messages) &&
            data.messages.length > 0
            ? data.messages
            : [WELCOME_MESSAGE]
        );

        setActiveTitle(data.title || "New Chat");
      } catch (error) {
        if (!cancelled) {
          console.error("History loading failed:", error);
          setMessages([WELCOME_MESSAGE]);
          setActiveTitle("New Chat");
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  // Abort any active frontend request when the component unmounts.
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Filter conversations by title.
  const filteredConversations = conversations.filter(
    (conversation) =>
      (conversation.title || "New Chat")
        .toLowerCase()
        .includes(searchQuery.trim().toLowerCase())
  );

  function openConversation(id) {
    if (loading || historyLoading) return;

    localStorage.setItem(CONVERSATION_KEY, id);
    setConversationId(id);
    setOpenMenuId(null);
  }

  function startNewChat() {
    if (loading) return;

    const newId = crypto.randomUUID();

    localStorage.setItem(CONVERSATION_KEY, newId);
    setConversationId(newId);
    setMessages([WELCOME_MESSAGE]);
    setActiveTitle("New Chat");
    setInput("");
    setOpenMenuId(null);
    setSearchQuery("");
  }

  async function renameConversation(conversation) {
    setOpenMenuId(null);

    const newTitle = window.prompt(
      "Enter a new conversation title:",
      conversation.title
    );

    if (newTitle === null) return;

    const title = newTitle.trim();

    if (!title) {
      window.alert("The title cannot be empty.");
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/conversations/${encodeURIComponent(
          conversation.conversation_id
        )}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Rename failed");
      }

      setConversations((previous) =>
        previous.map((item) =>
          item.conversation_id === conversation.conversation_id
            ? { ...item, title: data.title }
            : item
        )
      );

      if (conversationId === conversation.conversation_id) {
        setActiveTitle(data.title);
      }
    } catch (error) {
      console.error("Rename failed:", error);
      window.alert(
        error.message || "Could not rename conversation."
      );
    }
  }

  async function deleteConversation(conversation) {
    setOpenMenuId(null);

    const confirmed = window.confirm(
      `Delete "${conversation.title}"? This will permanently delete its saved messages.`
    );

    if (!confirmed) return;

    try {
      const response = await fetch(
        `${API_URL}/conversations/${encodeURIComponent(
          conversation.conversation_id
        )}`,
        { method: "DELETE" }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Delete failed");
      }

      const remaining = conversations.filter(
        (item) =>
          item.conversation_id !== conversation.conversation_id
      );

      setConversations(remaining);

      if (conversationId === conversation.conversation_id) {
        if (remaining.length > 0) {
          const nextConversation = remaining[0];

          localStorage.setItem(
            CONVERSATION_KEY,
            nextConversation.conversation_id
          );

          setConversationId(nextConversation.conversation_id);
          setOpenMenuId(null);
        } else {
          startNewChat();
        }
      }
    } catch (error) {
      console.error("Delete failed:", error);
      window.alert(
        error.message || "Could not delete conversation."
      );
      await refreshConversations();
    }
  }

  // Stop the active frontend request.
  function stopGenerating() {
    if (!abortControllerRef.current) return;

    abortControllerRef.current.abort();
  }

  async function sendMessageToBot(message, isRetry = false) {
    if (!message.trim() || loading || historyLoading) {
      return;
    }

    if (!isRetry) {
      setMessages((previous) => [
        ...previous,
        {
          role: "user",
          content: message,
        },
      ]);
    }

    setInput("");
    setLoading(true);

    let responseStatus = 0;

    const controller = new AbortController();

    abortControllerRef.current = controller;

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          conversation_id: conversationId,
        }),
        signal: controller.signal,
      });

      responseStatus = response.status;

      let data;

      try {
        data = await response.json();
      } catch {
        throw new Error("Invalid server response");
      }

      if (!response.ok) {
        throw new Error(data.detail || "Chat request failed");
      }

      if (
        typeof data.reply !== "string" ||
        !data.reply.trim()
      ) {
        throw new Error("Empty server response");
      }

      // Ignore the response if this request was stopped.
      if (controller.signal.aborted) return;

      if (data.conversation_id) {
        localStorage.setItem(
          CONVERSATION_KEY,
          data.conversation_id
        );

        if (data.conversation_id !== conversationId) {
          setConversationId(data.conversation_id);
        }
      }

      if (data.title) {
        setActiveTitle(data.title);
      }

      setMessages((previous) => [
        ...previous.filter(
          (item) =>
            !(
              item.isError &&
              item.failedMessage === message
            )
        ),
        {
          role: "assistant",
          content: data.reply,
        },
      ]);

      await refreshConversations();
    } catch (error) {
      // A deliberate stop is not a server error.
      if (
        error.name === "AbortError" ||
        controller.signal.aborted
      ) {
        setMessages((previous) => [
          ...previous.filter(
            (item) =>
              !(
                item.isError &&
                item.failedMessage === message
              )
          ),
          {
            role: "assistant",
            content: "Generation stopped.",
            stopped: true,
          },
        ]);

        return;
      }

      console.error("Chat request failed:", error);

      const friendlyMessage = getFriendlyError(
        error,
        responseStatus
      );

      setMessages((previous) => {
        const withoutOldError = previous.filter(
          (item) =>
            !(
              item.isError &&
              item.failedMessage === message
            )
        );

        return [
          ...withoutOldError,
          {
            role: "assistant",
            content: friendlyMessage,
            isError: true,
            failedMessage: message,
          },
        ];
      });
    } finally {
      // Do not clear a newer request's controller.
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setLoading(false);
      }
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const message = input.trim();

    if (!message || loading || historyLoading) {
      return;
    }

    await sendMessageToBot(message);
  }

  async function retryMessage(message) {
    if (!message || loading || historyLoading) {
      return;
    }

    await sendMessageToBot(message, true);
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">🕷️</span>
          <span>Spider Bot</span>
        </div>

        <button
          type="button"
          className="new-chat"
          onClick={startNewChat}
          disabled={loading}
        >
          <span>＋</span> New chat
        </button>

        <div className="sidebar-section-title">
          Your conversations
        </div>

        {/* Conversation search bar */}
        <div className="conversation-search">
          <span className="search-icon">⌕</span>

          <input
            type="search"
            className="conversation-search-input"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(event) =>
              setSearchQuery(event.target.value)
            }
            aria-label="Search conversations by title"
          />

          {searchQuery && (
            <button
              type="button"
              className="clear-search-button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear conversation search"
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <div className="conversation-list">
          {sidebarLoading ? (
            <p className="sidebar-message">
              Loading chats...
            </p>
          ) : conversations.length === 0 ? (
            <p className="sidebar-message">
              No conversations yet.
            </p>
          ) : filteredConversations.length === 0 ? (
            <p className="sidebar-message">
              No matching conversations found.
            </p>
          ) : (
            filteredConversations.map((conversation) => {
              const isActive =
                conversation.conversation_id === conversationId;

              return (
                <div
                  className={`conversation-item ${
                    isActive ? "active" : ""
                  }`}
                  key={conversation.conversation_id}
                >
                  <button
                    type="button"
                    className="conversation-title"
                    title={conversation.title}
                    onClick={() =>
                      openConversation(
                        conversation.conversation_id
                      )
                    }
                    disabled={loading || historyLoading}
                  >
                    <span className="conversation-icon">
                      💬
                    </span>

                    <span className="conversation-title-text">
                      {conversation.title || "New Chat"}
                    </span>
                  </button>

                  <button
                    type="button"
                    className="conversation-menu-button"
                    aria-label={`Options for ${conversation.title}`}
                    title="Conversation options"
                    onClick={() =>
                      setOpenMenuId((current) =>
                        current === conversation.conversation_id
                          ? null
                          : conversation.conversation_id
                      )
                    }
                  >
                    ⋯
                  </button>

                  {openMenuId ===
                    conversation.conversation_id && (
                    <div className="conversation-menu">
                      <button
                        type="button"
                        onClick={() =>
                          renameConversation(conversation)
                        }
                      >
                        ✏️ Rename
                      </button>

                      <button
                        type="button"
                        className="delete-conversation-button"
                        onClick={() =>
                          deleteConversation(conversation)
                        }
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="sidebar-footer">
          Conversations saved to database
        </div>
      </aside>

      <main className="chat-area">
        <header className="topbar">
          <div className="topbar-title">
            <h1>Spider Bot</h1>
            <p title={activeTitle}>{activeTitle}</p>
          </div>

          <span className="status">
            <span className="status-dot" />
            Online
          </span>
        </header>

        <section className="messages">
          {historyLoading ? (
            <p className="typing">
              Loading conversation...
            </p>
          ) : (
            messages.map((message, index) => (
              <div
                className={`message-row ${message.role}`}
                key={`${index}-${message.role}`}
              >
                {message.role === "assistant" && (
                  <div className="avatar">🕷️</div>
                )}

                <div className="message-bubble">
                  <div className="message-label">
                    {message.role === "user"
                      ? "You"
                      : "Spider Bot"}
                  </div>

                  <MessageContent content={message.content} />

                  {message.isError && (
                    <button
                      type="button"
                      className="retry-button"
                      onClick={() =>
                        retryMessage(message.failedMessage)
                      }
                      disabled={loading || historyLoading}
                    >
                      ↻ Retry
                    </button>
                  )}
                </div>

                {message.role === "user" && (
                  <div className="avatar user-avatar">
                    You
                  </div>
                )}
              </div>
            ))
          )}

          {loading && (
            <div className="message-row assistant">
              <div className="avatar">🕷️</div>

              <div className="message-bubble">
                <div className="message-label">
                  Spider Bot
                </div>

                <div className="typing">
                  Spider Bot is thinking...
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </section>

        <form className="input-area" onSubmit={handleSubmit}>
          <div className="input-wrapper">
            <textarea
              value={input}
              onChange={(event) =>
                setInput(event.target.value)
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey
                ) {
                  event.preventDefault();
                  event.currentTarget.form.requestSubmit();
                }
              }}
              placeholder="Message Spider Bot..."
              rows={1}
              disabled={loading || historyLoading}
            />

            {loading ? (
              <button
                type="button"
                className="stop-button"
                onClick={stopGenerating}
                aria-label="Stop generating"
                title="Stop generating"
              >
                ■ Stop
              </button>
            ) : (
              <button
                type="submit"
                className="send-button"
                disabled={
                  !input.trim() ||
                  historyLoading
                }
                aria-label="Send message"
              >
                ➤
              </button>
            )}
          </div>

          <p className="input-hint">
            {loading
              ? "Click Stop to interrupt the response"
              : "Press Enter to send · Shift + Enter for a new line"}
          </p>
        </form>
      </main>
    </div>
  );
}

export default App;