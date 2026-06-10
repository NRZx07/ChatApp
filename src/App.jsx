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

    // Use an isolated channel naming convention combining both IDs to prevent noise
    const channelRoomName = `room-${[session.user.id, friendId.trim()].sort().join("-")}`;

    const channel = supabase
      .channel(channelRoomName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new;

          // CRITICAL BUG FIX: If the message was sent by ME, do not append it via real-time.
          // handleSendMessage already handles adding and resolving this message in our state.
          if (msg.sender_id === session.user.id) {
            return;
          }

          // If the incoming message came from the friend to me, add it safely
          if (
            msg.sender_id === friendId.trim() &&
            msg.receiver_id === session.user.id
          ) {
            setMessages((prev) => {
              // Deduplicate just in case
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          }
        },
      )
      .subscribe();

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
        redirectTo:
          "https://chat-14tmjx58h-nirajs-projects-6e46d474.vercel.app/",
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
    setMessage("");

    // Generate a unique client side string to trace our optimistic item
    const clientSideId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const optimisticMessage = {
      id: clientSideId,
      text: typedText,
      sender_id: session.user.id,
      receiver_id: friendId.trim(),
      user_name: session.user.user_metadata?.full_name || "User",
      user_avatar: session.user.user_metadata?.picture,
      created_at: new Date().toISOString(),
      isOptimistic: true, // Used to give a subtle visual fade while sending
    };

    // Append optimistic message right away
    setMessages((prev) => [...prev, optimisticMessage]);

    const { error, data } = await supabase
      .from("messages")
      .insert([
        {
          text: typedText,
          sender_id: session.user.id,
          receiver_id: friendId.trim(),
          user_name: optimisticMessage.user_name,
          user_avatar: optimisticMessage.user_avatar,
        },
      ])
      .select();

    if (error) {
      console.error("Error inserting message:", error.message);
      // Evict message placeholder if backend breaks down
      setMessages((prev) => prev.filter((msg) => msg.id !== clientSideId));
      setMessage(typedText); // Hand back user data to the input box
    } else if (data && data[0]) {
      // Replace the optimistic entry smoothly with the true DB record row
      setMessages((prev) =>
        prev.map((msg) => (msg.id === clientSideId ? data[0] : msg)),
      );
    }
  };

  // GUARD A: If session is completely unknown, show loading screen
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

  // GUARD B: If not logged in, show Auth Wall
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

  // MAIN CONTENT VIEW
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
        {/* Header Block */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid #374151",
            paddingBottom: "15px",
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
            }}
          >
            Sign Out
          </button>
        </div>

        {/* Identity Exchange Section */}
        <div
          style={{
            background: "#111827",
            border: "1px solid #374151",
            borderRadius: "8px",
            padding: "15px",
            margin: "15px 0",
            fontSize: "14px",
          }}
        >
          <div style={{ marginBottom: "10px" }}>
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
                padding: "6px",
                display: "block",
                wordBreak: "break-all",
                color: "#60a5fa",
                borderRadius: "4px",
                fontSize: "12px",
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
                padding: "8px",
                boxSizing: "border-box",
                borderRadius: "4px",
                background: "#111827",
              }}
            />
          </div>
        </div>

        {/* Messages Stream Area */}
        <div
          style={{
            height: "300px",
            overflowY: "auto",
            padding: "10px",
            background: "#111827",
            borderRadius: "8px",
            border: "1px solid #374151",
          }}
        >
          {!friendId.trim() ? (
            <p
              style={{
                color: "#6b7280",
                textAlign: "center",
                paddingTop: "100px",
                fontStyle: "italic",
              }}
            >
              Please paste a partner's Chat ID above to initiate a secure
              interface. 🔐
            </p>
          ) : messages.length === 0 ? (
            <p
              style={{
                color: "#6b7280",
                textAlign: "center",
                paddingTop: "100px",
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
                    justifyContent: isMe ? "flex-end" : "flex-start",
                    margin: "10px 0",
                  }}
                >
                  <div
                    style={{
                      background: isMe ? "#2563eb" : "#374151",
                      padding: "10px",
                      borderRadius: "12px",
                      maxWidth: "70%",
                      // Slightly fade out the bubble while it is still uploading
                      opacity: msg.isOptimistic ? 0.6 : 1,
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

        {/* Form Action Footer */}
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
