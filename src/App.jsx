import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient"; // Make sure your path matches your project layout

function ChatRoom({ user }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [friendId, setFriendId] = useState(""); // Holds your friend's UUID key

  // 1. Fetch private history and listen to realtime updates whenever friendId changes
  useEffect(() => {
    if (!friendId.trim()) {
      setMessages([]);
      return;
    }

    const fetchPrivateMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${user.id})`,
        )
        .order("created_at", { ascending: true });

      if (error) console.error("Fetch error:", error.message);
      if (data) setMessages(data);
    };

    fetchPrivateMessages();

    // Setup an isolated real-time channel for this unique 2-way relationship
    const channel = supabase
      .channel(`private-room-${friendId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new;
          // Verify incoming realtime payload belongs strictly to this conversation before showing it
          if (
            (msg.sender_id === user.id && msg.receiver_id === friendId) ||
            (msg.sender_id === friendId && msg.receiver_id === user.id)
          ) {
            setMessages((prev) => [...prev, msg]);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [friendId, user.id]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || !friendId.trim()) return;

    const { error } = await supabase.from("messages").insert([
      {
        text: text,
        sender_id: user.id, // Your active authenticated Google ID
        receiver_id: friendId.trim(), // Your friend's target ID
        username: user.user_metadata.full_name || user.email,
      },
    ]);

    if (error) console.error("Send error:", error.message);
    setText("");
  };

  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "500px",
        margin: "0 auto",
        fontFamily: "sans-serif",
      }}
    >
      {/* BOX 1: YOUR REVEALED ENCRYPTED IDENTITY */}
      <div
        style={{
          background: "#f0f2f5",
          padding: "15px",
          borderRadius: "8px",
          marginBottom: "20px",
          border: "1px solid #ddd",
        }}
      >
        <h4 style={{ margin: "0 0 10px 0" }}>Your Personal Chat ID:</h4>
        <code
          style={{
            background: "#fff",
            padding: "8px",
            display: "block",
            wordBreak: "break-all",
            borderRadius: "4px",
            border: "1px solid #ccc",
          }}
        >
          {user.id}
        </code>
        <p style={{ fontSize: "12px", color: "#666", margin: "8px 0 0 0" }}>
          👉 Copy this key and send it to your friend!
        </p>
      </div>

      {/* BOX 2: TARGET CONNECTION POINT */}
      <div style={{ marginBottom: "20px" }}>
        <label>
          <strong>Paste Friend's Chat ID to open connection:</strong>
        </label>
        <input
          type="text"
          placeholder="Paste their long UUID key here..."
          value={friendId}
          onChange={(e) => setFriendId(e.target.value)}
          style={{
            width: "100%",
            padding: "10px",
            marginTop: "5px",
            boxSizing: "border-box",
            borderRadius: "4px",
            border: "1px solid #ccc",
          }}
        />
      </div>

      {/* BOX 3: THE PRIVATE SECURED CHAT FLOW */}
      {friendId.trim() ? (
        <div>
          <div
            style={{
              height: "300px",
              overflowY: "auto",
              border: "1px solid #ccc",
              padding: "10px",
              marginBottom: "10px",
              borderRadius: "4px",
              background: "#fafafa",
            }}
          >
            {messages.map((msg) => (
              <div key={msg.id} style={{ margin: "10px 0" }}>
                <span
                  style={{
                    color: msg.sender_id === user.id ? "#0070f3" : "#222",
                    fontWeight: "bold",
                  }}
                >
                  {msg.username}:
                </span>{" "}
                <span>{msg.text}</span>
              </div>
            ))}
          </div>
          <form onSubmit={handleSend} style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a completely private message..."
              style={{
                flexGrow: 1,
                padding: "10px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            />
            <button
              type="submit"
              style={{
                padding: "10px 20px",
                background: "#0070f3",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Send
            </button>
          </form>
        </div>
      ) : (
        <p style={{ textAlign: "center", color: "#999", fontStyle: "italic" }}>
          Please paste a friend's Chat ID above to initiate a secure space.
        </p>
      )}
    </div>
  );
}

export default ChatRoom;
