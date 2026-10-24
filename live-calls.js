(() => {
  "use strict";

  const client = window.supabaseClient;

  const $ = (id) => document.getElementById(id);

  const userSelect = $("callUserSelect");
  const audioButton = $("startAudioCallButton");
  const videoButton = $("startVideoCallButton");
  const status = $("liveCallStatus");
  const incomingControls = $("incomingCallControls");
  const incomingText = $("incomingCallText");
  const acceptButton = $("acceptCallButton");
  const rejectButton = $("rejectCallButton");
  const endButton = $("endLiveCallButton");
  const videos = $("liveCallVideos");
  const localVideo = $("localCallVideo");
  const remoteVideo = $("remoteCallVideo");

  let currentUser = null;
  let signalChannel = null;
  let peer = null;
  let localStream = null;
  let remoteStream = null;
  let remoteAudio = null;

  let callId = null;
  let remoteUserId = null;
  let callMode = "audio";
  let pendingOffer = null;
  let callActive = false;
  let incomingPending = false;

  const queuedIce = new Map();

  const rtcConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" }
    ]
  };

  function setStatus(message) {
    status.textContent = message;
  }

  function setCallButtons(enabled) {
    audioButton.disabled = !enabled;
    videoButton.disabled = !enabled;
  }

  function queueIce(id, candidate) {
    if (!queuedIce.has(id)) queuedIce.set(id, []);
    queuedIce.get(id).push(candidate);
  }

  async function sendSignal(type, recipientId, id, payload = {}) {
    if (!currentUser || !recipientId || !id) {
      throw new Error("The call session is incomplete.");
    }

    const { error } = await client
      .from("nexora_call_signals")
      .insert({
        call_id: id,
        sender_id: currentUser.id,
        recipient_id: recipientId,
        signal_type: type,
        payload
      });

    if (error) throw error;
  }

  async function loadUsers() {
    userSelect.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = currentUser
      ? "Loading NEXORA users..."
      : "Sign in first";
    userSelect.appendChild(placeholder);

    if (!currentUser) return;

    const { data, error } = await client
      .from("profiles")
      .select("user_id, username, display_name")
      .neq("user_id", currentUser.id)
      .order("display_name");

    if (error) {
      userSelect.replaceChildren();
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Could not load users";
      userSelect.appendChild(option);
      setStatus("Could not load users: " + error.message);
      return;
    }

    userSelect.replaceChildren();

    const first = document.createElement("option");
    first.value = "";
    first.textContent = "Choose a NEXORA user";
    userSelect.appendChild(first);

    for (const profile of data || []) {
      if (!profile.user_id) continue;

      const option = document.createElement("option");
      option.value = profile.user_id;
      option.textContent =
        profile.display_name ||
        profile.username ||
        ("NEXORA user " + profile.user_id.slice(0, 8));

      userSelect.appendChild(option);
    }

    if (!data || data.length === 0) {
      first.textContent = "No other users found";
    }
  }

  function createPeer() {
    peer = new RTCPeerConnection(rtcConfig);
    remoteStream = new MediaStream();

    remoteAudio = new Audio();
    remoteAudio.autoplay = true;
    remoteAudio.playsInline = true;

    peer.ontrack = (event) => {
      const streams = event.streams || [];

      if (streams[0]) {
        remoteStream = streams[0];
      } else {
        remoteStream.addTrack(event.track);
      }

      remoteAudio.srcObject = remoteStream;
      remoteAudio.play().catch(() => {
        setStatus("Tap the page if audio does not start.");
      });

      if (callMode === "video") {
        remoteVideo.srcObject = remoteStream;
        videos.hidden = false;
      }
    };

    peer.onicecandidate = async (event) => {
      if (!event.candidate || !callId || !remoteUserId) return;

      try {
        await sendSignal(
          "ice-candidate",
          remoteUserId,
          callId,
          { candidate: event.candidate.toJSON() }
        );
      } catch (error) {
        setStatus("Could not send connection data: " + error.message);
      }
    };

    peer.onconnectionstatechange = () => {
      if (!peer) return;

      if (peer.connectionState === "connected") {
        callActive = true;
        setStatus(
          callMode === "video"
            ? "Video call connected. 🎥"
            : "Voice call connected. 📞"
        );
      } else if (peer.connectionState === "failed") {
        setStatus("Connection failed. A TURN server may be needed.");
      } else if (peer.connectionState === "disconnected") {
        setStatus("Connection interrupted. Trying to reconnect...");
      }
    };

    if (localStream) {
      localStream.getTracks().forEach((track) => {
        peer.addTrack(track, localStream);
      });
    }
  }

  async function getLocalMedia(mode) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Use HTTPS and allow microphone/camera access.");
    }

    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mode === "video"
    });

    if (mode === "video") {
      localVideo.srcObject = localStream;
      videos.hidden = false;
    }
  }

  async function addQueuedIce(id) {
    if (!peer) return;

    const candidates = queuedIce.get(id) || [];
    queuedIce.delete(id);

    for (const candidate of candidates) {
      try {
        await peer.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      } catch (error) {
        console.warn("Could not add queued ICE candidate:", error);
      }
    }
  }

  async function startCall(mode) {
    if (!currentUser) {
      setStatus("Sign in to NEXORA before calling.");
      return;
    }

    const selectedUser = userSelect.value;

    if (!selectedUser) {
      setStatus("Choose a user first.");
      return;
    }

    if (selectedUser === currentUser.id) {
      setStatus("You cannot call your own account.");
      return;
    }

    if (callId) {
      setStatus("Finish the current call before starting another.");
      return;
    }

    callId = crypto.randomUUID();
    remoteUserId = selectedUser;
    callMode = mode;
    callActive = false;
    incomingPending = false;
    setCallButtons(false);
    endButton.hidden = false;

    try {
      setStatus("Requesting microphone/camera permission...");
      await getLocalMedia(mode);

      createPeer();

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      await sendSignal("offer", remoteUserId, callId, {
        sdp: peer.localDescription,
        mode
      });

      setStatus("Calling user... Waiting for them to answer.");
    } catch (error) {
      setStatus("Could not start call: " + error.message);
      await cleanupCall();
    }
  }

  async function acceptCall() {
    if (!currentUser || !callId || !pendingOffer || !remoteUserId) {
      setStatus("No incoming call is waiting.");
      return;
    }

    acceptButton.disabled = true;
    rejectButton.disabled = true;

    try {
      setStatus("Connecting to the caller...");
      await getLocalMedia(callMode);

      createPeer();

      await peer.setRemoteDescription(
        new RTCSessionDescription(pendingOffer)
      );

      await addQueuedIce(callId);

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      await sendSignal("answer", remoteUserId, callId, {
        sdp: peer.localDescription
      });

      incomingPending = false;
      pendingOffer = null;
      incomingControls.hidden = true;
      endButton.hidden = false;
      setStatus("Answer sent. Connecting...");
    } catch (error) {
      setStatus("Could not accept call: " + error.message);

      try {
        await sendSignal("reject", remoteUserId, callId);
      } catch (_) {}

      await cleanupCall();
    } finally {
      acceptButton.disabled = false;
      rejectButton.disabled = false;
    }
  }

  async function rejectCall() {
    if (!callId || !remoteUserId) return;

    try {
      await sendSignal("reject", remoteUserId, callId);
    } catch (error) {
      console.warn("Could not send rejection:", error);
    }

    await cleanupCall();
    setStatus("Call rejected.");
  }

  async function endCall() {
    if (!callId) return;

    try {
      await sendSignal("end", remoteUserId, callId);
    } catch (error) {
      console.warn("Could not send call-end signal:", error);
    }

    await cleanupCall();
    setStatus("Call ended.");
  }

  async function cleanupCall() {
    const oldId = callId;

    if (peer) {
      peer.ontrack = null;
      peer.onicecandidate = null;
      peer.close();
    }

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }

    if (remoteAudio) {
      remoteAudio.pause();
      remoteAudio.srcObject = null;
    }

    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;

    if (oldId) queuedIce.delete(oldId);

    peer = null;
    localStream = null;
    remoteStream = null;
    remoteAudio = null;

    callId = null;
    remoteUserId = null;
    pendingOffer = null;
    callActive = false;
    incomingPending = false;
    callMode = "audio";

    incomingControls.hidden = true;
    endButton.hidden = true;
    videos.hidden = true;
    setCallButtons(Boolean(currentUser));
  }

  async function handleSignal(signal) {
    if (!signal || signal.sender_id === currentUser?.id) return;

    const type = signal.signal_type;
    const id = signal.call_id;

    if (type === "ice-candidate") {
      if (id !== callId || !peer || !peer.remoteDescription) {
        queueIce(id, signal.payload?.candidate);
        return;
      }

      try {
        if (signal.payload?.candidate) {
          await peer.addIceCandidate(
            new RTCIceCandidate(signal.payload.candidate)
          );
        }
      } catch (error) {
        console.warn("Could not add ICE candidate:", error);
      }
      return;
    }

    if (type === "offer") {
      if (callId) {
        try {
          await sendSignal("busy", signal.sender_id, id);
        } catch (_) {}
        return;
      }

      callId = id;
      remoteUserId = signal.sender_id;
      callMode = signal.payload?.mode === "video" ? "video" : "audio";
      pendingOffer = signal.payload?.sdp || null;
      incomingPending = true;

      incomingText.textContent =
        (callMode === "video" ? "🎥 Incoming video call" : "📞 Incoming voice call");

      incomingControls.hidden = false;
      setCallButtons(false);
      setStatus("Incoming call. Accept or reject it.");
      await addQueuedIce(id);
      return;
    }

    if (id !== callId) return;

    if (type === "answer") {
      if (!peer || !signal.payload?.sdp) return;

      try {
        await peer.setRemoteDescription(
          new RTCSessionDescription(signal.payload.sdp)
        );
        await addQueuedIce(id);
        setStatus("Answer received. Connecting...");
      } catch (error) {
        setStatus("Could not connect the call: " + error.message);
        await cleanupCall();
      }
    } else if (type === "reject") {
      await cleanupCall();
      setStatus("The other user rejected the call.");
    } else if (type === "busy") {
      await cleanupCall();
      setStatus("The other user is busy.");
    } else if (type === "end" || type === "cancel") {
      await cleanupCall();
      setStatus("The other user ended the call.");
    }
  }

  async function connectForUser(user) {
    if (signalChannel) {
      await client.removeChannel(signalChannel);
      signalChannel = null;
    }

    await cleanupCall();
    currentUser = user;

    await loadUsers();
    setCallButtons(Boolean(currentUser));

    if (!currentUser) {
      setStatus("Sign in to use live calls.");
      return;
    }

    signalChannel = client
      .channel("nexora-call-signals-" + currentUser.id)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "nexora_call_signals",
          filter: "recipient_id=eq." + currentUser.id
        },
        (event) => {
          handleSignal(event.new).catch((error) => {
            setStatus("Call signal error: " + error.message);
          });
        }
      )
      .subscribe((state) => {
        if (state === "SUBSCRIBED") {
          setStatus("Ready for NEXORA calls. 🌍");
        } else if (state === "CHANNEL_ERROR") {
          setStatus("Could not connect to call signaling.");
        }
      });
  }

  audioButton.addEventListener("click", () => startCall("audio"));
  videoButton.addEventListener("click", () => startCall("video"));
  acceptButton.addEventListener("click", acceptCall);
  rejectButton.addEventListener("click", rejectCall);
  endButton.addEventListener("click", endCall);

  if (!client?.auth) {
    setStatus("Supabase configuration was not found.");
    setCallButtons(false);
    return;
  }

  let lastAuthUserId = "__not_initialized__";
  let authInitQueue = Promise.resolve();

  function scheduleAuthUpdate(session) {
    const user = session?.user || null;
    const userId = user?.id || null;

    if (userId === lastAuthUserId) return;
    lastAuthUserId = userId;

    authInitQueue = authInitQueue
      .then(() => connectForUser(user))
      .catch((error) => {
        setStatus("Could not initialize calls: " + error.message);
      });
  }

  client.auth.onAuthStateChange((_event, session) => {
    scheduleAuthUpdate(session);
  });

  client.auth.getSession().then(({ data, error }) => {
    if (error) {
      setStatus("Could not check login: " + error.message);
      return;
    }

    scheduleAuthUpdate(data.session);
  });
})();
