import { supabase } from "../supabaseClient";
import { useState, useEffect, useRef } from "react";

function App() {
  const [session, setSession] = useState(undefined);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]); // Tracks live & old messages

  // Create a reference point at the bottom of the chat view
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

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 2. Fetch History & Open Realtime WebSocket Subscription
  useEffect(() => {
    if (!session) return;

    // Fetch previously saved messages from your DB
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: true });

      if (!error && data) {
        setMessages(data);
      }
    };

    fetchMessages();

    // Listen live for INSERT events on your 'messages' table
    const channel = supabase
      .channel("schema-db-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          // Append incoming database rows to state
          setMessages((prev) => [...prev, payload.new]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session]);

  // 3. Smooth-scroll window down automatically on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 4. Google Authentication In/Out Actions
  const signIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) console.log(error.message);
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.log(error.message);
  };

  // 5. Handle sending chat message to the Supabase Database
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!message.trim() || !session) return;

    const typedText = message;
    setMessage(""); // Instantly clear input field

    // Create a temporary ID and a local message object for the UI
    const temporaryId = Date.now();
    const optimisticMessage = {
      id: temporaryId,
      text: typedText,
      user_id: session.user.id,
      user_name:
        session.user.user_metadata?.full_name ||
        session.user.user_metadata?.name ||
        "User",
      user_avatar: session.user.user_metadata?.picture,
      created_at: new Date().toISOString(), // Use current local time
    };

    // 1. INSTANTLY show it on the screen
    setMessages((prev) => [...prev, optimisticMessage]);

    // 2. Send it to Supabase behind the scenes
    const { error, data } = await supabase
      .from("messages")
      .insert([
        {
          text: typedText,
          user_id: session.user.id,
          user_name: optimisticMessage.user_name,
          user_avatar: optimisticMessage.user_avatar,
        },
      ])
      .select(); // .select() returns the real database row

    if (error) {
      console.error("Error inserting message:", error.message);
      // Rollback: Remove the temporary message if it failed to save
      setMessages((prev) => prev.filter((msg) => msg.id !== temporaryId));
      setMessage(typedText); // Put text back into the input box
    } else if (data && data[0]) {
      // Replace our temporary local message with the official one from Supabase
      setMessages((prev) =>
        prev.map((msg) => (msg.id === temporaryId ? data[0] : msg)),
      );
    }
  };

  // UI View: Initial loading check
  if (session === undefined) {
    return (
      <div className="bg-gray-900 text-white h-screen flex items-center justify-center font-semibold">
        Loading...
      </div>
    );
  }

  // UI View: Authentication Wall
  if (!session) {
    return (
      <div className="bg-gray-900 text-white h-screen flex items-center justify-center">
        <button
          onClick={signIn}
          className="bg-blue-500 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold transition shadow-md"
        >
          Sign In with Google
        </button>
      </div>
    );
  }

  // UI View: Main Chat Application Dashboard
  return (
    <div className="bg-gray-900 text-white min-h-screen p-4">
      <div className="bg-gray-800 border border-gray-700 max-w-5xl mx-auto rounded-xl h-[90vh] flex flex-col p-4 shadow-xl">
        {/* Profile Header */}
        <div className="flex justify-between items-center border-b border-gray-700 pb-4">
          <div className="flex items-center gap-3">
            <img
              src={
                session?.user?.user_metadata?.picture ||
                "https://placehold.co/150"
              }
              alt="profile"
              className="w-12 h-12 rounded-full border border-gray-600"
              referrerPolicy="no-referrer"
            />
            <div>
              <h2 className="font-semibold text-lg">
                {session?.user?.user_metadata?.full_name ||
                  session?.user?.user_metadata?.name ||
                  "User"}
              </h2>
              <p className="text-sm text-gray-400">{session?.user?.email}</p>
            </div>
          </div>

          <button
            onClick={signOut}
            className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            Sign Out
          </button>
        </div>

        {/* Dynamic Chat Messages Area */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {messages.length === 0 ? (
            <div className="text-gray-500 text-center py-10">
              No messages here yet. Say hello! 👋
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.user_id === session.user.id;
              return (
                <div
                  key={msg.id}
                  className={`flex gap-2 items-end ${isMe ? "justify-end" : "justify-start"}`}
                >
                  {/* Show avatars only on other users' messages */}
                  {!isMe && (
                    <img
                      src={msg.user_avatar || "https://placehold.co/150"}
                      alt=""
                      className="w-7 h-7 rounded-full mb-1 border border-gray-600"
                      referrerPolicy="no-referrer"
                    />
                  )}

                  <div
                    className={`p-3 rounded-2xl max-w-md shadow-sm ${isMe ? "bg-blue-600 text-white rounded-br-none" : "bg-gray-700 text-white rounded-bl-none"}`}
                  >
                    {!isMe && (
                      <p className="text-xs text-blue-400 mb-1 font-bold">
                        {msg.user_name}
                      </p>
                    )}
                    <p className="break-words text-[15px]">{msg.text}</p>

                    {/* Timestamp formatted nicely */}
                    <p className="text-[10px] text-gray-300 text-right mt-1 opacity-65 select-none">
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          {/* Scroll anchor target dummy element */}
          <div ref={messagesEndRef} />
        </div>

        {/* Form Input Footer */}
        <form onSubmit={handleSendMessage} className="flex gap-2 mt-4">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-400"
          />

          <button
            type="submit"
            className="bg-blue-500 hover:bg-blue-600 px-6 py-3 rounded-lg font-semibold transition shadow-md"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
