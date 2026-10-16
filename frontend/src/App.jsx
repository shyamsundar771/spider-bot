import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import LoginPage from "./LoginPage";
import "./App.css";


const API_URL = import.meta.env.VITE_API_URL || "http://192.168.2.97:8000";
const CONVERSATION_KEY = "spider_bot_conversation_id";
const TOKEN_KEY = "spider_bot_token";
const USER_KEY = "spider_bot_user";

// App-wide Spider-Man background image
const APP_BACKGROUND_IMAGE = "/spiderman-app.png";

const WELCOME_MESSAGE = {
  role: "assistant",
  content: "Hello! I'm Spider Bot 🕷️ How can I help you today?",
};

// FIX: crypto.randomUUID() is unavailable on non-HTTPS origins in some browsers.
// Use a fallback that works everywhere.
function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}

async function authFetch(url, options = {}, token) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...options, headers });
}

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
    return "Your session has expired. Please log in again.";
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
  const [token, setToken] = useState(
    () => localStorage.getItem(TOKEN_KEY)
  );

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch {
      return null;
    }
  });

  const [messages, setMessages] = useState([WELCOME_MESSAGE]);

  const [conversationId, setConversationId] = useState(
    () => localStorage.getItem(CONVERSATION_KEY)
  );

  const [conversations, setConversations] = useState([]);
  const [activeTitle, setActiveTitle] = useState("New Chat");
  const [openMenuId, setOpenMenuId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // NEW: Mobile sidebar open/close state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [input, setInput] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [sidebarLoading, setSidebarLoading] = useState(true);

  const [editingIndex, setEditingIndex] = useState(null);
  const [editedText, setEditedText] = useState("");
  const [editError, setEditError] = useState("");

  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const fileInputRef = useRef(null);

  const ALLOWED_FILE_EXTENSIONS = [
    ".pdf", ".txt", ".png", ".jpg", ".jpeg", ".webp", ".gif",
    ".docx", ".csv", ".py", ".js", ".jsx", ".ts", ".tsx",
    ".html", ".css", ".json", ".md", ".java", ".c", ".cpp",
    ".h", ".hpp", ".sql", ".xml", ".yaml", ".yml", ".sh", ".bat",
  ];

  function handleAuthSuccess(newToken, newUser) {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(CONVERSATION_KEY);
    setToken(null);
    setUser(null);
    setConversationId(null);
    setConversations([]);
    setMessages([WELCOME_MESSAGE]);
    setActiveTitle("New Chat");
    setHistoryLoading(false);
    setSidebarLoading(false);
    setEditingIndex(null);
    setEditedText("");
    setEditError("");
    setOpenMenuId(null);
    setSearchQuery("");
    setInput("");
    setSelectedFiles([]);
    setSidebarOpen(false);
  }

  function handleFileSelection(event) {
    const files = Array.from(event.target.files || []);
    const acceptedFiles = [];
    const rejectedFiles = [];

    files.forEach((file) => {
      const dotIndex = file.name.lastIndexOf(".");
      const extension =
        dotIndex >= 0 ? file.name.slice(dotIndex).toLowerCase() : "";

      if (!ALLOWED_FILE_EXTENSIONS.includes(extension)) {
        rejectedFiles.push(file.name);
      } else if (file.size > 10 * 1024 * 1024) {
        rejectedFiles.push(`${file.name} (larger than 10 MB)`);
      } else {
        acceptedFiles.push(file);
      }
    });

    setSelectedFiles((previous) => {
      const combined = [...previous];
      acceptedFiles.forEach((file) => {
        if (
          !combined.some(
            (existing) =>
              existing.name === file.name &&
              existing.size === file.size &&
              existing.lastModified === file.lastModified
          )
        ) {
          combined.push(file);
        }
      });
      return combined;
    });

    if (rejectedFiles.length > 0) {
      window.alert(
        `These files were not added. Supported files must be PDF, TXT, images, DOCX, CSV, or code files, and each file must be 10 MB or smaller:\n\n${rejectedFiles.join("\n")}`
      );
    }

    event.target.value = "";
  }

  function removeSelectedFile(fileToRemove) {
    setSelectedFiles((previous) =>
      previous.filter(
        (file) =>
          !(file.name === fileToRemove.name &&
            file.size === fileToRemove.size &&
            file.lastModified === fileToRemove.lastModified)
      )
    );
  }

  async function refreshConversations() {
    if (!token) {
      setSidebarLoading(false);
      return;
    }

    try {
      const response = await authFetch(
        `${API_URL}/conversations`,
        {},
        token
      );

      if (response.status === 401) {
        handleLogout();
        return;
      }

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
    if (!token) {
      setSidebarLoading(false);
      return;
    }
    refreshConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      if (!token) {
        setHistoryLoading(false);
        return;
      }

      if (!conversationId) {
        setMessages([WELCOME_MESSAGE]);
        setActiveTitle("New Chat");
        setHistoryLoading(false);
        return;
      }

      setHistoryLoading(true);

      try {
        const response = await authFetch(
          `${API_URL}/chat/${encodeURIComponent(
            conversationId
          )}/history`,
          {},
          token
        );

        if (cancelled) return;

        if (response.status === 401) {
          handleLogout();
          return;
        }

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
        setEditingIndex(null);
        setEditedText("");
        setEditError("");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // NEW: Close sidebar when user opens a conversation on mobile
  useEffect(() => {
    setSidebarOpen(false);
  }, [conversationId]);

  const filteredConversations = conversations.filter(
    (conversation) =>
      (conversation.title || "New Chat")
        .toLowerCase()
        .includes(searchQuery.trim().toLowerCase())
  );

  function openConversation(id) {
    if (loading || historyLoading || editingIndex !== null) {
      return;
    }

    localStorage.setItem(CONVERSATION_KEY, id);
    setConversationId(id);
    setOpenMenuId(null);
    setSidebarOpen(false); // NEW: Close sidebar on mobile
  }

  function startNewChat() {
    if (loading || editingIndex !== null) return;

    // FIX: use generateId() instead of crypto.randomUUID()
    const newId = generateId();

    localStorage.setItem(CONVERSATION_KEY, newId);
    setConversationId(newId);
    setMessages([WELCOME_MESSAGE]);
    setActiveTitle("New Chat");
    setInput("");
    setSelectedFiles([]);
    setOpenMenuId(null);
    setSearchQuery("");
    setEditingIndex(null);
    setEditedText("");
    setEditError("");
    setSidebarOpen(false); // NEW: Close sidebar on mobile
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
      const response = await authFetch(
        `${API_URL}/conversations/${encodeURIComponent(
          conversation.conversation_id
        )}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title }),
        },
        token
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
      window.alert(error.message || "Could not rename conversation.");
    }
  }

  async function deleteConversation(conversation) {
    setOpenMenuId(null);

    const confirmed = window.confirm(
      `Delete "${conversation.title}"? This will permanently delete its saved messages.`
    );

    if (!confirmed) return;

    try {
      const response = await authFetch(
        `${API_URL}/conversations/${encodeURIComponent(
          conversation.conversation_id
        )}`,
        { method: "DELETE" },
        token
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
      window.alert(error.message || "Could not delete conversation.");
      await refreshConversations();
    }
  }

  function beginEditing(message, index) {
    if (
      loading ||
      historyLoading ||
      editingIndex !== null ||
      message.role !== "user" ||
      message.isError
    ) {
      return;
    }

    if (!Number.isInteger(message.id)) {
      setEditError(
        "This message has no database ID. Reload the conversation and try again."
      );
      return;
    }

    setEditingIndex(index);
    setEditedText(message.content || "");
    setEditError("");
  }

  function cancelEditing() {
    setEditingIndex(null);
    setEditedText("");
    setEditError("");
  }

  async function saveAndResend(index) {
    const editedMessage = editedText.trim();

    if (!editedMessage) {
      setEditError("Message cannot be empty.");
      return;
    }

    if (loading || historyLoading || editingIndex !== index) {
      return;
    }

    if (!conversationId) {
      setEditError("Please open a saved conversation first.");
      return;
    }

    const targetMessage = messages[index];

    if (
      !targetMessage ||
      targetMessage.role !== "user" ||
      !Number.isInteger(targetMessage.id)
    ) {
      setEditError(
        "Cannot identify this saved message. Reload the conversation and try again."
      );
      return;
    }

    if (editedMessage === targetMessage.content.trim()) {
      cancelEditing();
      return;
    }

    setEditError("");
    setLoading(true);

    try {
      const deleteResponse = await authFetch(
        `${API_URL}/chat/${encodeURIComponent(
          conversationId
        )}/edit/${targetMessage.id}`,
        {
          method: "DELETE",
        },
        token
      );

      let deleteData;

      try {
        deleteData = await deleteResponse.json();
      } catch {
        throw new Error("Invalid response while preparing the edit.");
      }

      if (!deleteResponse.ok) {
        throw new Error(
          deleteData.detail || "Could not prepare the message for editing."
        );
      }

      const remainingMessages = messages.slice(0, index);

      setMessages(remainingMessages);
      setEditingIndex(null);
      setEditedText("");
      setActiveTitle("New Chat");

      await refreshConversations();

      setLoading(false);
      await sendMessageToBot(editedMessage, false, [], true);
    } catch (error) {
      console.error("Edit and resend failed:", error);

      setEditError(
        error.message ||
          "Could not edit this message. Please try again."
      );

      setLoading(false);

      try {
        const response = await authFetch(
          `${API_URL}/chat/${encodeURIComponent(
            conversationId
          )}/history`,
          {},
          token
        );

        if (response.ok) {
          const data = await response.json();

          setMessages(
            Array.isArray(data.messages) && data.messages.length > 0
              ? data.messages
              : [WELCOME_MESSAGE]
          );

          setActiveTitle(data.title || "New Chat");
        }
      } catch (reloadError) {
        console.error(
          "History recovery failed:",
          reloadError
        );
      }
    }
  }

  function stopGenerating() {
    abortControllerRef.current?.abort();
  }

  async function sendMessageToBot(
    message,
    isRetry = false,
    filesOverride = null,
    allowWhileLoading = false
  ) {
    const cleanMessage = (message || "").trim();
    const filesToSend = filesOverride ?? selectedFiles;

    if (
      (!cleanMessage && filesToSend.length === 0) ||
      (loading && !allowWhileLoading) ||
      historyLoading
    ) {
      return;
    }

    const attachmentNames = filesToSend.map((file) => file.name);
    const attachmentLabel = attachmentNames.length
      ? `[Attached files: ${attachmentNames.join(", ")}]`
      : "";
    const displayedMessage = cleanMessage
      ? `${cleanMessage}${attachmentLabel ? `\n\n${attachmentLabel}` : ""}`
      : attachmentLabel;

    if (!isRetry) {
      setMessages((previous) => [
        ...previous,
        {
          role: "user",
          content: displayedMessage,
          pending: true,
        },
      ]);
    }

    setInput("");
    setSelectedFiles([]);
    setLoading(true);

    let responseStatus = 0;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const formData = new FormData();
      formData.append("message", cleanMessage);
      formData.append("conversation_id", conversationId || "");

      filesToSend.forEach((file) => {
        formData.append("files", file, file.name);
      });

      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
        headers: token
          ? { Authorization: `Bearer ${token}` }
          : {},
      });

      responseStatus = response.status;

      if (response.status === 401) {
        handleLogout();
        return;
      }

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error("Invalid server response");
      }

      if (!response.ok) {
        const error = new Error(data.detail || "Chat request failed");
        error.status = response.status;
        throw error;
      }

      if (typeof data.reply !== "string" || !data.reply.trim()) {
        throw new Error("Empty server response");
      }

      if (controller.signal.aborted) return;

      const savedConversationId = data.conversation_id || conversationId;

      if (savedConversationId) {
        localStorage.setItem(CONVERSATION_KEY, savedConversationId);
        if (savedConversationId !== conversationId) {
          setConversationId(savedConversationId);
        }
      }

      if (data.title) {
        setActiveTitle(data.title);
      }

      setMessages((previous) => [
        ...previous.filter(
          (item) =>
            !(item.isError && item.failedMessage === cleanMessage) &&
            !(
              item.pending &&
              item.role === "user" &&
              item.content === displayedMessage
            )
        ),
        {
          role: "assistant",
          content: data.reply,
        },
      ]);

      if (savedConversationId) {
        try {
          const historyResponse = await authFetch(
            `${API_URL}/chat/${encodeURIComponent(
              savedConversationId
            )}/history`,
            {},
            token
          );

          if (historyResponse.ok) {
            const historyData = await historyResponse.json();
            if (
              !controller.signal.aborted &&
              savedConversationId ===
                (localStorage.getItem(CONVERSATION_KEY) ||
                  savedConversationId)
            ) {
              setMessages(
                Array.isArray(historyData.messages) &&
                  historyData.messages.length > 0
                  ? historyData.messages
                  : [WELCOME_MESSAGE]
              );
              setActiveTitle(
                historyData.title || data.title || "New Chat"
              );
            }
          }
        } catch (historyError) {
          console.error(
            "Could not refresh saved message IDs:",
            historyError
          );
        }
      }

      await refreshConversations();
    } catch (error) {
      if (error.name === "AbortError" || controller.signal.aborted) {
        setMessages((previous) => [
          ...previous.map((item) =>
            item.pending ? { ...item, pending: false } : item
          ),
          {
            role: "assistant",
            content: "Generation stopped.",
            stopped: true,
          },
        ]);
        if (filesToSend.length > 0) {
          setSelectedFiles(filesToSend);
        }
        return;
      }

      console.error("Chat request failed:", error);
      const friendlyMessage = getFriendlyError(
        error,
        error.status || responseStatus
      );

      setMessages((previous) => {
        const withoutOldError = previous
          .map((item) =>
            item.pending ? { ...item, pending: false } : item
          )
          .filter(
            (item) => !(item.isError && item.failedMessage === cleanMessage)
          );

        return [
          ...withoutOldError,
          {
            role: "assistant",
            content: friendlyMessage,
            isError: true,
            failedMessage: cleanMessage,
            failedFiles: filesToSend,
          },
        ];
      });

      if (filesToSend.length > 0) {
        setSelectedFiles(filesToSend);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setLoading(false);
      }
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (loading || historyLoading) return;

    const message = input.trim();

    if (!message && selectedFiles.length === 0) {
      return;
    }

    await sendMessageToBot(message);
  }

  async function retryMessage(message, files = []) {
    if (loading || historyLoading) return;

    await sendMessageToBot(message || "", true, files);
  }

  if (!token) {
    return <LoginPage onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="app">
      {/* App-wide Spider-Man background */}
      <div className="app-background" aria-hidden="true">
        <img
          src={APP_BACKGROUND_IMAGE}
          alt=""
          className="app-background-image"
          draggable="false"
        />
        <div className="app-background-overlay" />
      </div>

      {/* NEW: Mobile overlay to close sidebar by tapping outside */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-icon">🕷️</span>
          <span>Spider Bot</span>
        </div>

        <div className="sidebar-user">
          <span
            className="sidebar-user-name"
            title={user?.email || ""}
          >
            {user?.username || user?.email || "User"}
          </span>
          <button
            type="button"
            className="logout-button"
            onClick={handleLogout}
            title="Log out"
          >
            Log out
          </button>
        </div>

        <button
          type="button"
          className="new-chat"
          onClick={startNewChat}
          disabled={loading || editingIndex !== null}
        >
          <span>＋</span> New chat
        </button>

        <div className="sidebar-section-title">
          Your conversations
        </div>

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
            <p className="sidebar-message">Loading chats...</p>
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
                    disabled={
                      loading ||
                      historyLoading ||
                      editingIndex !== null
                    }
                  >
                    <span className="conversation-icon">💬</span>

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
                    disabled={editingIndex !== null}
                  >
                    ⋯
                  </button>

                  {openMenuId === conversation.conversation_id && (
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
          {/* NEW: Hamburger button — only visible on mobile via CSS */}
          <button
            type="button"
            className="hamburger-button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            ☰
          </button>

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
            <p className="typing">Loading conversation...</p>
          ) : (
            messages.map((message, index) => (
              <div
                className={`message-row ${message.role}`}
                key={`${message.id ?? "new"}-${index}-${message.role}`}
              >
                {message.role === "assistant" && (
                  <div className="avatar">🕷️</div>
                )}

                <div className="message-bubble">
                  <div className="message-label">
                    {message.role === "user" ? "You" : "Spider Bot"}
                  </div>

                  {editingIndex === index ? (
                    <div className="edit-message-form">
                      <textarea
                        className="edit-message-textarea"
                        value={editedText}
                        onChange={(event) => {
                          setEditedText(event.target.value);
                          setEditError("");
                        }}
                        rows={Math.min(
                          10,
                          Math.max(3, editedText.split("\n").length)
                        )}
                        autoFocus
                        aria-label="Edit your message"
                        disabled={loading}
                      />

                      {editError && (
                        <p className="edit-message-error">
                          {editError}
                        </p>
                      )}

                      <div className="edit-message-actions">
                        <button
                          type="button"
                          className="cancel-edit-button"
                          onClick={cancelEditing}
                          disabled={loading}
                        >
                          Cancel
                        </button>

                        <button
                          type="button"
                          className="save-resend-button"
                          onClick={() => saveAndResend(index)}
                          disabled={
                            loading || !editedText.trim()
                          }
                        >
                          Save &amp; Resend
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <MessageContent content={message.content} />

                      {message.role === "user" &&
                        !message.isError &&
                        !message.stopped && (
                          <div className="user-message-actions">
                            <button
                              type="button"
                              className="edit-message-button"
                              onClick={() =>
                                beginEditing(message, index)
                              }
                              disabled={
                                loading ||
                                historyLoading ||
                                editingIndex !== null
                              }
                              title="Edit and resend this message"
                              aria-label="Edit and resend this message"
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
                              </svg>
                            </button>
                          </div>
                        )}
                    </>
                  )}

                  {message.isError && (
                    <button
                      type="button"
                      className="retry-button"
                      onClick={() =>
                        retryMessage(
                          message.failedMessage,
                          message.failedFiles || []
                        )
                      }
                      disabled={loading || historyLoading}
                    >
                      ↻ Retry
                    </button>
                  )}
                </div>

                {message.role === "user" && (
                  <div className="avatar user-avatar">You</div>
                )}
              </div>
            ))
          )}

          {loading && (
            <div className="message-row assistant">
              <div className="avatar">🕷️</div>

              <div className="message-bubble">
                <div className="message-label">Spider Bot</div>
                <div className="typing">
                  Spider Bot is thinking...
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </section>

        <form className="input-area" onSubmit={handleSubmit}>
          {selectedFiles.length > 0 && (
            <div
              className="selected-attachments"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                marginBottom: "10px",
              }}
            >
              {selectedFiles.map((file) => (
                <div
                  key={`${file.name}-${file.size}-${file.lastModified}`}
                  className="selected-attachment"
                  title={file.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    maxWidth: "100%",
                    padding: "7px 10px",
                    border: "1px solid #414653",
                    borderRadius: "10px",
                    background: "#20232c",
                    color: "#f1f3f8",
                    fontSize: "12px",
                  }}
                >
                  <span aria-hidden="true">📎</span>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "220px",
                    }}
                  >
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSelectedFile(file)}
                    disabled={loading || editingIndex !== null}
                    aria-label={`Remove ${file.name}`}
                    title="Remove file"
                    style={{
                      border: 0,
                      background: "transparent",
                      color: "inherit",
                      cursor: "pointer",
                      fontSize: "16px",
                      lineHeight: 1,
                      padding: "0 2px",
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,.gif,.docx,.csv,.py,.js,.jsx,.ts,.tsx,.html,.css,.json,.md,.java,.c,.cpp,.h,.hpp,.sql,.xml,.yaml,.yml,.sh,.bat"
            onChange={handleFileSelection}
            style={{ display: "none" }}
            aria-label="Choose files to attach"
          />

          <div className="input-wrapper">
            <button
              type="button"
              className="attach-file-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={
                loading || historyLoading || editingIndex !== null
              }
              title="Attach files (maximum 10 MB each)"
              aria-label="Attach files"
              style={{
                flexShrink: 0,
                border: "1px solid #414653",
                borderRadius: "10px",
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
                padding: "8px 10px",
                fontSize: "18px",
              }}
            >
              📎
            </button>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
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
              disabled={
                loading ||
                historyLoading ||
                editingIndex !== null
              }
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
                  (!input.trim() &&
                    selectedFiles.length === 0) ||
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
              : editingIndex !== null
                ? "Finish editing or cancel to continue chatting"
                : "Press Enter to send · Shift + Enter for a new line"}
          </p>
        </form>
      </main>
    </div>
  );
}

export default App;