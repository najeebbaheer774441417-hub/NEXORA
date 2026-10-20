async function renderGlobalChat() {
  const list = document.getElementById("globalChatList");
  const status = document.getElementById("chatStatus");

  if (!list) return;

  const { data, error } = await window.supabaseClient
    .from("global_chat_messages")
    .select("id, name, message, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Global Chat:", error);
    status.textContent = "Could not load chat messages.";
    return;
  }

  list.replaceChildren();

  if (!data || data.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Start the global conversation! 🌍";
    list.appendChild(empty);
    return;
  }

  data.forEach(item => {
    const box = document.createElement("div");
    box.className = "message";

    const author = document.createElement("strong");
    author.textContent = item.name;

    const message = document.createElement("p");
    message.textContent = item.message;

    const time = document.createElement("small");
    time.textContent = new Date(item.created_at).toLocaleString();

    box.append(author, message, time);

    if (isNexoraAdmin) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.textContent = "🗑️ Delete";
      button.addEventListener("click", () => deleteChatMessage(item.id));
      box.appendChild(button);
    }

    list.appendChild(box);
  });
}

async function sendChatMessage() {
  const nameInput = document.getElementById("chatName");
  const messageInput = document.getElementById("chatMessage");
  const status = document.getElementById("chatStatus");

  const name = nameInput.value.trim();
  const message = messageInput.value.trim();

  if (!name || !message) {
    status.textContent = "Please enter your name and message.";
    return;
  }

  if (name.length > 35 || message.length > 500) {
    status.textContent = "Name limit: 35 characters. Message limit: 500.";
    return;
  }

  status.textContent = "Sending message...";

  const { error } = await window.supabaseClient
    .from("global_chat_messages")
    .insert([{ name, message }]);

  if (error) {
    console.error("Global Chat:", error);
    status.textContent = "Could not send message. Please try again.";
    return;
  }

  messageInput.value = "";
  status.textContent = "Message sent successfully! 💙";
  await renderGlobalChat();
}

async function deleteChatMessage(id) {
  if (!isNexoraAdmin) return;
  if (!confirm("Delete this chat message?")) return;

  const { error } = await window.supabaseClient
    .from("global_chat_messages")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Global Chat delete:", error);
    alert("Could not delete this message. Please try again.");
    return;
  }

  await renderGlobalChat();
}
