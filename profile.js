async function loadNexoraProfile(user) {
  const card = document.getElementById("profileCard");
  const status = document.getElementById("profileStatus");

  if (!card || !user) {
    if (card) card.hidden = true;
    return;
  }

  card.hidden = false;
  status.textContent = "Loading your profile...";

  const { data, error } = await window.supabaseClient
    .from("profiles")
    .select("display_name, bio, avatar_url")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    status.textContent = "Could not load profile: " + error.message;
    return;
  }

  if (data) {
    document.getElementById("profileDisplayName").value =
      data.display_name || "";
    document.getElementById("profileBio").value = data.bio || "";

    if (data.avatar_url) {
      document.getElementById("profileAvatarPreview").src =
        data.avatar_url;
    }
  }

  status.textContent = "Your profile is ready.";
}

async function saveNexoraProfile() {
  const client = window.supabaseClient;
  const status = document.getElementById("profileStatus");
  const displayName =
    document.getElementById("profileDisplayName").value.trim();
  const bio = document.getElementById("profileBio").value.trim();
  const file = document.getElementById("profileAvatar").files[0];

  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();

  const user = sessionData?.session?.user;

  if (sessionError || !user) {
    status.textContent = "Please sign in first.";
    return;
  }

  if (!displayName || displayName.length > 35 || bio.length > 160) {
    status.textContent = "Name: 1–35 characters. Bio: up to 160.";
    return;
  }

  const { data: current, error: readError } = await client
    .from("profiles")
    .select("avatar_url")
    .eq("user_id", user.id)
    .maybeSingle();

  if (readError || !current) {
    status.textContent = readError
      ? readError.message
      : "Profile not found. Please check your account.";
    return;
  }

  let avatarUrl = current.avatar_url;

  if (file) {
    const allowed = ["image/jpeg", "image/png", "image/webp"];

    if (!allowed.includes(file.type) || file.size > 2 * 1024 * 1024) {
      status.textContent = "Choose JPG, PNG, or WebP up to 2 MB.";
      return;
    }

    const extension = file.type === "image/png" ? "png"
      : file.type === "image/webp" ? "webp" : "jpg";

    const path = `${user.id}/avatar-${Date.now()}.${extension}`;

    status.textContent = "Uploading photo...";

    const { error: uploadError } = await client.storage
      .from("avatars")
      .upload(path, file, { contentType: file.type });

    if (uploadError) {
      status.textContent = "Photo upload failed: " + uploadError.message;
      return;
    }

    avatarUrl = client.storage.from("avatars").getPublicUrl(path)
      .data.publicUrl;
  }

  status.textContent = "Saving profile...";

  const { data: saved, error } = await client
    .from("profiles")
    .update({
      display_name: displayName,
      bio: bio,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", user.id)
    .select("user_id")
    .maybeSingle();

  if (error || !saved) {
    status.textContent = error
      ? "Save failed: " + error.message
      : "Profile was not updated.";
    return;
  }

  if (avatarUrl) {
    document.getElementById("profileAvatarPreview").src = avatarUrl;
  }

  document.getElementById("profileAvatar").value = "";
  status.textContent = "Profile saved successfully! 💙";
}
