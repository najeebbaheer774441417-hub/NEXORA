async function renderGlobalChat() {
  const list = document.getElementById("globalChatList");
  const status = document.getElementById("chatStatus");

  if (!list) return;

  const { data, error } = await window.supabaseClient
    .from("global_chat_messages")
    .select("id, user_id, name, message, created_at")
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

  const userIds = [...new Set(data.map(item => item.user_id).filter(Boolean))];
  const profileMap = new Map();
  if (userIds.length) {
    const { data: profiles, error: profileError } = await window.supabaseClient
      .from("profiles")
      .select("user_id, display_name, avatar_url")
      .in("user_id", userIds);
    if (profileError) console.error("Chat profiles:", profileError);
    (profiles || []).forEach(profile => profileMap.set(profile.user_id, profile));
  }

  data.forEach(item => {
    const box = document.createElement("div");
    box.className = "message";

    const profile = item.user_id ? profileMap.get(item.user_id) : null;
    const authorLine = document.createElement("div");
    authorLine.style.display = "flex";
    authorLine.style.alignItems = "center";
    authorLine.style.gap = "10px";
    authorLine.style.marginBottom = "8px";

    if (profile && profile.avatar_url) {
      const avatar = document.createElement("img");
      avatar.src = profile.avatar_url;
      avatar.alt = "Profile picture";
      avatar.width = 42;
      avatar.height = 42;
      avatar.style.borderRadius = "50%";
      avatar.style.objectFit = "cover";
      authorLine.appendChild(avatar);
    }

    const author = document.createElement("strong");
    author.textContent = (profile && profile.display_name) || item.name || "NEXORA User";
    authorLine.appendChild(author);

    const message = document.createElement("p");
    message.textContent = item.message;

    const time = document.createElement("small");
    time.textContent = new Date(item.created_at).toLocaleString();

    box.append(authorLine, message, time);

    const likeButton = document.createElement("button");
    likeButton.type = "button";
    likeButton.className = "secondary";
    likeButton.textContent = "❤️ Like (…)";
    likeButton.addEventListener("click", () => likeChatMessage(item.id, likeButton));
    box.appendChild(likeButton);

    getChatLikeCount(item.id).then(count => {
      likeButton.textContent = `❤️ Like (${count})`;
    });

    const reportButton = document.createElement("button");
    reportButton.type = "button";
    reportButton.className = "secondary";
    reportButton.textContent = "🚩 Report";
    reportButton.addEventListener("click", () => reportChatMessage(item.id));
    box.appendChild(reportButton);

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

  const { data: { session } } = await window.supabaseClient.auth.getSession();

  const { error } = await window.supabaseClient
    .from("global_chat_messages")
    .insert([{ name, message, user_id: session?.user?.id ?? null }]);

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

async function reportChatMessage(id) {
  const reason = prompt("Why are you reporting this message? (3–300 characters)");
  if (reason === null) return;

  const cleanReason = reason.trim();
  const status = document.getElementById("chatStatus");

  if (cleanReason.length < 3 || cleanReason.length > 300) {
    status.textContent = "Please enter a reason between 3 and 300 characters.";
    return;
  }

  const { error } = await window.supabaseClient
    .from("global_chat_reports")
    .insert([{ message_id: id, reason: cleanReason }]);

  if (error) {
    console.error("Global Chat report:", error);
    status.textContent = "Could not submit report. Please try again.";
    return;
  }

  status.textContent = "Report submitted. Thank you. 💙";
}

async function getChatLikeCount(messageId) {
  const { count, error } = await window.supabaseClient
    .from("global_chat_likes")
    .select("id", { count: "exact", head: true })
    .eq("message_id", messageId);

  if (error) {
    console.error("Like count error:", error);
    return 0;
  }

  return count || 0;
}

function getChatVoterId() {
  let voterId = localStorage.getItem("nexora_chat_voter_id");

  if (!voterId) {
    voterId = crypto.randomUUID();
    localStorage.setItem("nexora_chat_voter_id", voterId);
  }

  return voterId;
}

async function likeChatMessage(messageId, button) {
  const status = document.getElementById("chatStatus");
  const voterId = getChatVoterId();

  button.disabled = true;

  const { error } = await window.supabaseClient
    .from("global_chat_likes")
    .insert([{
      message_id: messageId,
      voter_id: voterId
    }]);

  if (error) {
    console.error("Like error:", error);
    status.textContent = "Could not add Like. Please try again.";
    button.disabled = false;
    return;
  }

  status.textContent = "Liked! ❤️";
  await renderGlobalChat();
}
