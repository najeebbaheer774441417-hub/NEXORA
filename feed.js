// NEXORA FEED — Supabase integration

async function loadNexoraPosts(currentUser = null) {
  const list = document.getElementById("nexoraPostsList");
  if (!list) return;

  list.replaceChildren();

  if (!currentUser) {
    const note = document.createElement("p");
    note.textContent = "Please sign in to view the community feed.";
    list.appendChild(note);
    return;
  }

  const loading = document.createElement("p");
  loading.textContent = "Loading posts...";
  list.appendChild(loading);

  try {
    const { data, error } = await window.supabaseClient
      .from("nexora_posts")
      .select("id,user_id,content,image_url,created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    list.replaceChildren();

    if (!data || data.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No posts yet. Be the first to share! 🌍";
      list.appendChild(empty);
      return;
    }

    const postIds = data.map(post => post.id);
    let feedLikes = [];
    let feedComments = [];

    const [likesResult, commentsResult] = await Promise.all([
      window.supabaseClient.from("nexora_post_likes")
        .select("id,post_id,user_id")
        .in("post_id", postIds),
      window.supabaseClient.from("nexora_post_comments")
        .select("id,post_id,user_id,content,created_at")
        .in("post_id", postIds)
        .order("created_at", { ascending: true })
        .limit(200)
    ]);

    if (likesResult.error) {
      console.warn("Feed likes could not load:", likesResult.error);
    } else {
      feedLikes = likesResult.data || [];
    }

    if (commentsResult.error) {
      console.warn("Feed comments could not load:", commentsResult.error);
    } else {
      feedComments = commentsResult.data || [];
    }

    data.forEach(post => {
      const card = document.createElement("article");
      card.className = "nexora-post";

      const meta = document.createElement("p");
      meta.className = "nexora-post-meta";
      meta.textContent =
        "NEXORA member • " +
        new Date(post.created_at).toLocaleString();

      const content = document.createElement("p");
      content.className = "nexora-post-content";
      content.textContent = post.content;

      card.append(meta, content);

      if (post.image_url) {
        try {
          const url = new URL(post.image_url);

          if (["https:", "http:"].includes(url.protocol)) {
            const img = document.createElement("img");
            img.src = url.href;
            img.alt = "Image attached to a NEXORA post";
            img.loading = "lazy";
            img.className = "nexora-post-image";
            card.appendChild(img);
          }
        } catch {
          // Ignore invalid image URLs.
        }
      }

      const postLikes = feedLikes.filter(item => item.post_id === post.id);
      const userLiked = postLikes.some(item => item.user_id === currentUser.id);

      const actions = document.createElement("div");
      actions.className = "nexora-post-actions";

      const likeButton = document.createElement("button");
      likeButton.type = "button";
      likeButton.className = "secondary nexora-like-button";
      likeButton.textContent = `${userLiked ? "❤️ Liked" : "🤍 Like"} (${postLikes.length})`;
      likeButton.setAttribute("aria-pressed", String(userLiked));

      likeButton.addEventListener("click", async () => {
        likeButton.disabled = true;
        try {
          if (userLiked) {
            const { error } = await window.supabaseClient
              .from("nexora_post_likes")
              .delete()
              .eq("post_id", post.id)
              .eq("user_id", currentUser.id);
            if (error) throw error;
          } else {
            const { error } = await window.supabaseClient
              .from("nexora_post_likes")
              .insert([{ post_id: post.id, user_id: currentUser.id }]);
            if (error) throw error;
          }
          await loadNexoraPosts(currentUser);
        } catch (error) {
          console.error("Feed Like failed:", error);
          const status = document.getElementById("nexoraPostStatus");
          if (status) status.textContent = "Could not update Like. Please try again.";
          likeButton.disabled = false;
        }
      });

      actions.appendChild(likeButton);

      const postComments = feedComments.filter(item => item.post_id === post.id);
      const commentsBox = document.createElement("div");
      commentsBox.className = "nexora-comments";

      const commentsTitle = document.createElement("p");
      commentsTitle.className = "nexora-comments-title";
      commentsTitle.textContent = `💬 Comments (${postComments.length})`;
      commentsBox.appendChild(commentsTitle);

      postComments.forEach(comment => {
        const line = document.createElement("p");
        line.className = "nexora-comment";
        line.textContent =
          `${comment.user_id === currentUser.id ? "You" : "NEXORA member"}: ${comment.content}`;
        commentsBox.appendChild(line);
      });

      const commentForm = document.createElement("form");
      commentForm.className = "nexora-comment-form";

      const commentInput = document.createElement("input");
      commentInput.type = "text";
      commentInput.maxLength = 1000;
      commentInput.placeholder = "Write a comment...";
      commentInput.setAttribute("aria-label", "Write a comment");
      commentInput.required = true;

      const commentButton = document.createElement("button");
      commentButton.type = "submit";
      commentButton.textContent = "Comment";

      commentForm.append(commentInput, commentButton);
      commentForm.addEventListener("submit", async event => {
        event.preventDefault();
        const text = commentInput.value.trim();
        if (!text) return;

        commentButton.disabled = true;
        try {
          const { error } = await window.supabaseClient
            .from("nexora_post_comments")
            .insert([{
              post_id: post.id,
              user_id: currentUser.id,
              content: text
            }]);
          if (error) throw error;

          const status = document.getElementById("nexoraPostStatus");
          if (status) status.textContent = "Comment added. 💬";
          await loadNexoraPosts(currentUser);
        } catch (error) {
          console.error("Adding feed comment failed:", error);
          const status = document.getElementById("nexoraPostStatus");
          if (status) status.textContent = "Could not add comment. Please try again.";
          commentButton.disabled = false;
        }
      });

      commentsBox.appendChild(commentForm);
      card.append(actions, commentsBox);

      if (post.user_id === currentUser.id) {
        const del = document.createElement("button");
        del.type = "button";
        del.textContent = "🗑️ Delete my post";
        del.className = "secondary";

        del.addEventListener("click", async () => {
          if (!confirm("Delete this post?")) return;

          del.disabled = true;

          try {
            const { error } = await window.supabaseClient
              .from("nexora_posts")
              .delete()
              .eq("id", post.id)
              .eq("user_id", currentUser.id);

            if (error) throw error;

            document.getElementById("nexoraPostStatus").textContent =
              "Post deleted.";
            await loadNexoraPosts(currentUser);
          } catch (error) {
            console.error("Delete post failed:", error);
            document.getElementById("nexoraPostStatus").textContent =
              "Could not delete the post. Please try again.";
            del.disabled = false;
          }
        });

        card.appendChild(del);
      }

      list.appendChild(card);
    });
  } catch (error) {
    console.error("Loading posts failed:", error);
    list.replaceChildren();

    const note = document.createElement("p");
    note.textContent = "Could not load posts: " + (error.message || "Unknown error");
    list.appendChild(note);
  }
}

document.getElementById("nexoraCreatePostButton")
  ?.addEventListener("click", async () => {
    const contentInput = document.getElementById("nexoraPostContent");
    const imageInput = document.getElementById("nexoraPostImage");
    const status = document.getElementById("nexoraPostStatus");
    const button = document.getElementById("nexoraCreatePostButton");

    const content = contentInput.value.trim();
    const rawImage = imageInput.value.trim();

    if (!content) {
      status.textContent = "Please write something before posting.";
      return;
    }

    let imageUrl = null;

    if (rawImage) {
      try {
        const url = new URL(rawImage);

        if (!["https:", "http:"].includes(url.protocol)) {
          throw new Error("Invalid URL protocol");
        }

        imageUrl = url.href;
      } catch {
        status.textContent = "Please enter a valid image URL.";
        return;
      }
    }

    const { data: auth, error: authError } =
      await window.supabaseClient.auth.getUser();

    if (authError || !auth?.user) {
      status.textContent = "Please sign in before posting.";
      return;
    }

    button.disabled = true;
    status.textContent = "Publishing your post...";

    try {
      const { error } = await window.supabaseClient
        .from("nexora_posts")
        .insert([{
          user_id: auth.user.id,
          content,
          image_url: imageUrl
        }]);

      if (error) throw error;

      contentInput.value = "";
      imageInput.value = "";
      status.textContent = "Your post has been published! 🌍";

      await loadNexoraPosts(auth.user);
    } catch (error) {
      console.error("Creating post failed:", error);
      status.textContent = "Could not publish: " + (error.message || "Unknown error");
    } finally {
      button.disabled = false;
    }
  });


// Keep the feed synchronized with the signed-in user.
window.supabaseClient.auth.getSession().then(({ data, error }) => {
  if (error) {
    console.error("Could not check NEXORA session:", error);
    loadNexoraPosts(null);
    return;
  }
  loadNexoraPosts(data?.session?.user ?? null);
});

window.supabaseClient.auth.onAuthStateChange((event, session) => {
  setTimeout(() => {
    loadNexoraPosts(session?.user ?? null);
  }, 0);
});

window.loadNexoraPosts = loadNexoraPosts;
