(() => {
  const supabase = window.supabaseClient;
  const bucket = "nexora-voice";
  const table = "global_chat_voice_messages";

  const recordBtn = document.getElementById("voiceRecordButton");
  const stopBtn = document.getElementById("voiceStopButton");
  const sendBtn = document.getElementById("voiceSendButton");
  const preview = document.getElementById("voicePreview");
  const status = document.getElementById("voiceStatus");
  const list = document.getElementById("globalVoiceList");

  let recorder = null;
  let stream = null;
  let chunks = [];
  let audioBlob = null;
  let audioUrl = null;
  let recordingTimer = null;

  function setStatus(message) {
    status.textContent = message;
  }

  function releaseMicrophone() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    clearTimeout(recordingTimer);
    recordingTimer = null;
  }

  function clearPreview() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = null;
    audioBlob = null;
    preview.removeAttribute("src");
    preview.hidden = true;
    sendBtn.disabled = true;
  }

  async function currentUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data.user;
  }

  async function startRecording() {
    try {
      if (!navigator.mediaDevices?.getUserMedia ||
          !window.MediaRecorder) {
        throw new Error("Your browser does not support audio recording.");
      }

      const user = await currentUser();
      if (!user) {
        setStatus("Please sign in before recording a voice message.");
        return;
      }

      clearPreview();
      chunks = [];

      stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const types = [
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/mp4",
        "audio/webm"
      ];

      const mimeType = types.find(type =>
        MediaRecorder.isTypeSupported(type)
      );

      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = () => {
        releaseMicrophone();
        setStatus("Recording failed. Please try again.");
      };

      recorder.onstop = () => {
        releaseMicrophone();

        if (chunks.length) {
          const type = recorder.mimeType || "audio/webm";
          audioBlob = new Blob(chunks, { type });

          if (audioBlob.size > 5 * 1024 * 1024) {
            clearPreview();
            setStatus("Voice message is too large. Maximum size is 5 MB.");
            return;
          }

          audioUrl = URL.createObjectURL(audioBlob);
          preview.src = audioUrl;
          preview.hidden = false;
          sendBtn.disabled = false;
          setStatus("Recording ready. Listen, then tap Send Voice.");
        } else {
          setStatus("No audio recorded. Please try again.");
        }

        recordBtn.disabled = false;
        stopBtn.disabled = true;
      };

      recorder.start();
      recordBtn.disabled = true;
      stopBtn.disabled = false;
      setStatus("Recording... Maximum 60 seconds.");

      recordingTimer = setTimeout(() => {
        if (recorder && recorder.state === "recording") {
          recorder.stop();
        }
      }, 60000);

    } catch (error) {
      releaseMicrophone();
      setStatus(error.message || "Could not start recording.");
    }
  }

  function stopRecording() {
    if (recorder && recorder.state === "recording") {
      recorder.stop();
      setStatus("Preparing your recording...");
    }
  }

  async function sendVoice() {
    if (!audioBlob) return;

    sendBtn.disabled = true;
    setStatus("Uploading voice message...");

    try {
      const user = await currentUser();
      if (!user) throw new Error("Please sign in before sending voice messages.");

      if (audioBlob.size > 5 * 1024 * 1024) {
        throw new Error("Maximum audio size is 5 MB.");
      }

      const nameInput = document.getElementById("chatName");
      const name = nameInput.value.trim().slice(0, 35);

      if (!name) {
        throw new Error("Please enter your name or nickname in the chat.");
      }

      const mime = audioBlob.type.toLowerCase();
      let extension = "webm";
      if (mime.includes("ogg")) extension = "ogg";
      else if (mime.includes("mp4")) extension = "mp4";
      else if (mime.includes("mpeg")) extension = "mp3";

      const path = `${user.id}/${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, audioBlob, {
          contentType: audioBlob.type || "audio/webm",
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from(table)
        .insert({
          user_id: user.id,
          name,
          file_path: path
        });

      if (insertError) {
        await supabase.storage.from(bucket).remove([path]);
        throw insertError;
      }

      clearPreview();
      chunks = [];
      setStatus("Voice message sent successfully! 🎙️");
      await renderVoiceMessages();

    } catch (error) {
      setStatus(error.message || "Could not send voice message.");
      sendBtn.disabled = !audioBlob;
    }
  }

  async function renderVoiceMessages() {
    try {
      const { data: messages, error } = await supabase
        .from(table)
        .select("id, name, file_path, created_at")
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;
      list.replaceChildren();

      for (const message of messages || []) {
        const { data, error: urlError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(message.file_path, 3600);

        const card = document.createElement("div");
        card.className = "message";

        const title = document.createElement("strong");
        title.textContent = message.name || "NEXORA User";
        card.appendChild(title);

        if (!urlError && data?.signedUrl) {
          const player = document.createElement("audio");
          player.controls = true;
          player.preload = "none";
          player.src = data.signedUrl;
          player.style.width = "100%";
          card.appendChild(player);
        }

        list.appendChild(card);
      }
    } catch (error) {
      setStatus("Could not load voice messages: " + error.message);
    }
  }

  recordBtn.addEventListener("click", startRecording);
  stopBtn.addEventListener("click", stopRecording);
  sendBtn.addEventListener("click", sendVoice);

  renderVoiceMessages();
})();
