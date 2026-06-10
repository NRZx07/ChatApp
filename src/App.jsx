import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";

function App() {
  const [session, setSession] = useState(undefined);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [friendId, setFriendId] = useState("");

  const messagesEndRef = useRef(null);

  // 1. Manage User Authentication Session
  useEffect(() => {
    const getSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSession(session);
    };
    getSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Fetch Private History & Open Isolated Realtime Subscription
  useEffect(() => {
    if (!session?.user) return;

    if (!friendId.trim()) {
      setMessages([]);
      return;
    }

    const fetchPrivateMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${session.user.id},receiver_id.eq.${friendId.trim()}),and(sender_id.eq.${friendId.trim()},receiver_id.eq.${session.user.id})`,
        )
        .order("created_at", { ascending: true });

      if (!error && data) {
        setMessages(data);
      }
    };

    fetchPrivateMessages();

    const channelRoomName = `room-${[session.user.id, friendId.trim()].sort().join("-")}`;

    const channel = supabase
      .channel(channelRoomName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new;

          const isRelevant =
            (msg.sender_id === session.user.id &&
              msg.receiver_id === friendId.trim()) ||
            (msg.sender_id === friendId.trim() &&
              msg.receiver_id === session.user.id);

          if (isRelevant) {
            // Functional state updater to evaluate the freshest array state at runtime
            setMessages((prevMessages) => {
              // Primary deduplication guard: drops duplicate real-time snapshots
              if (prevMessages.some((m) => m.id === msg.id)) {
                return prevMessages;
              }
              return [...prevMessages, msg];
            });
          }
        },
      )
      .subscribe();

    // The Critical Cleanup: Destroys duplicate listeners on component cycles
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, friendId]);

  // 3. Smooth-scroll down window automatically on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 4. Google Authentication In/Out Actions
  const signIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin, // Dynamically uses your current live Vercel link
      },
    });
    if (error) console.log(error.message);
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.log(error.message);
  };

  // 5. Handle sending private chat message to Supabase
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!message.trim() || !session?.user || !friendId.trim()) return;

    const typedText = message;
    setMessage(""); // Clear input instantly for UI speed

    const { error } = await supabase.from("messages").insert([
      {
        text: typedText,
        sender_id: session.user.id,
        receiver_id: friendId.trim(),
        user_name: session.user.user_metadata?.full_name || "User",
        user_avatar: session.user.user_metadata?.picture,
      },
    ]);

    if (error) {
      console.error("Error inserting message:", error.message);
      setMessage(typedText); // Fallback text back to input if network fails
    }
  };

  if (session === undefined) {
    return (
      <div
        style={{
          background: "#111827",
          color: "white",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
        }}
      >
        Loading Session Data...
      </div>
    );
  }

  if (!session) {
    return (
      <div
        style={{
          background: "#111827",
          color: "white",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
        }}
      >
        <button
          onClick={signIn}
          style={{
            background: "#3b82f6",
            color: "white",
            padding: "12px 24px",
            borderRadius: "8px",
            border: "none",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Sign In with Google
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#111827",
        color: "white",
        minHeight: "100vh",
        padding: "20px",
        fontFamily: "sans-serif",
      }}
    >
      {/* VERSION VERIFICATION BANNER */}
      <div
        style={{
          background: "#22c55e",
          color: "#052e16",
          padding: "12px",
          textAlign: "center",
          fontWeight: "bold",
          borderRadius: "8px",
          marginBottom: "20px",
          fontSize: "15px",
        }}
      >
        LATEST CHAT VERSION IS LIVE 🚀 (Layout & Anti-Duplication Patch
        Configured)
      </div>

      <div
        style={{
          background: "#1f2937",
          border: "1px solid #374151",
          maxWidth: "600px",
          margin: "0 auto",
          borderRadius: "12px",
          padding: "20px",
        }}
      >
        {/* HEADER BLOCK */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid #374151",
            paddingBottom: "15px",
            marginBottom: "15px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <img
              src={
                session.user.user_metadata?.picture ||
                "https://placehold.co/150"
              }
              alt="profile"
              style={{ width: "48px", height: "48px", borderRadius: "50%" }}
              referrerPolicy="no-referrer"
            />
            <div>
              <h2 style={{ margin: 0, fontSize: "18px" }}>
                {session.user.user_metadata?.full_name || "User"}
              </h2>
              <p style={{ margin: 0, fontSize: "14px", color: "#9ca3af" }}>
                {session.user.email}
              </p>
            </div>
          </div>
          <button
            onClick={signOut}
            style={{
              background: "#ef4444",
              color: "white",
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Sign Out
          </button>
        </div>

        {/* IDENTITY EXCHANGE SYSTEM */}
        <div
          style={{
            background: "#111827",
            border: "1px solid #374151",
            borderRadius: "8px",
            padding: "15px",
            marginBottom: "15px",
            fontSize: "14px",
          }}
        >
          <div style={{ marginBottom: "12px" }}>
            <span
              style={{
                color: "#9ca3af",
                display: "block",
                marginBottom: "4px",
              }}
            >
              Your Personal Chat ID:
            </span>
            <code
              style={{
                background: "#1f2937",
                border: "1px solid #4b5563",
                padding: "8px",
                display: "block",
                wordBreak: "break-all",
                color: "#60a5fa",
                borderRadius: "4px",
                fontSize: "12px",
                userSelect: "all",
              }}
            >
              {session.user.id}
            </code>
          </div>
          <div>
            <span
              style={{
                color: "#9ca3af",
                display: "block",
                marginBottom: "4px",
              }}
            >
              Recipient Friend's Chat ID:
            </span>
            <input
              type="text"
              placeholder="Paste friend's long UUID key..."
              value={friendId}
              onChange={(e) => setFriendId(e.target.value)}
              style={{
                width: "100%",
                border: "1px solid #4b5563",
                color: "#4ade80",
                padding: "10px",
                boxSizing: "border-box",
                borderRadius: "4px",
                background: "#111827",
              }}
            />
          </div>
        </div>

        {/* MESSAGES STREAM AREA */}
        <div
          style={{
            height: "350px",
            overflowY: "auto",
            padding: "15px",
            background: "#111827",
            borderRadius: "8px",
            border: "1px solid #374151",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {!friendId.trim() ? (
            <p
              style={{
                color: "#6b7280",
                textAlign: "center",
                paddingTop: "120px",
                fontStyle: "italic",
                margin: 0,
              }}
            >
              Please paste a partner's Chat ID above to unlock the chat window.
              🔐
            </p>
          ) : messages.length === 0 ? (
            <p
              style={{
                color: "#6b7280",
                textAlign: "center",
                paddingTop: "120px",
                margin: 0,
              }}
            >
              Secured channel activated. Say hello! 👋
            </p>
          ) : (
            messages.map((msg) => {
              const isMe = msg.sender_id === session.user.id;
              return (
                <div
                  key={msg.id}
                  style={{
                    display: "flex",
                    justifyContent: isMe ? "flex-end" : "flex-start", // CamelCase layout alignment fix
                    margin: "6px 0",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      background: isMe ? "#2563eb" : "#374151",
                      color: "white",
                      padding: "10px 14px",
                      borderRadius: isMe
                        ? "12px 12px 0px 12px"
                        : "12px 12px 12px 0px",
                      maxWidth: "75%",
                      wordBreak: "break-word",
                    }}
                  >
                    <p style={{ margin: 0, fontSize: "15px" }}>{msg.text}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ACTION FORM FOOTER */}
        <form
          onSubmit={handleSendMessage}
          style={{ display: "flex", gap: "8px", marginTop: "15px" }}
        >
          <input
            type="text"
            value={message}
            disabled={!friendId.trim()}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              friendId.trim()
                ? "Type a private message..."
                : "Unlock input by providing an ID above..."
            }
            style={{
              flexGrow: 1,
              background: "#374151",
              border: "1px solid #4b5563",
              borderRadius: "8px",
              padding: "12px",
              color: "white",
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={!friendId.trim()}
            style={{
              background: "#3b82f6",
              color: "white",
              padding: "0 24px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
