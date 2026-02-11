// public/main.js
const socket = io();

const username = localStorage.getItem("username");
if (!username) window.location.href = "/views/login.html";

document.getElementById("who").innerText = `Logged in as: ${username}`;

// ✅ register user for private messaging
socket.emit("registerUser", username);

let currentRoom = null;
let typingTimer = null;
let mode = "room"; // room | private
let currentPrivateUser = null;

function logout() {
  localStorage.removeItem("username");
  window.location.href = "/views/login.html";
}

function onModeChange() {
  mode = document.getElementById("mode").value;

  document.getElementById("messages").innerHTML = "";
  document.getElementById("typingText").innerText = "";

  const roomControls = document.getElementById("roomControls");
  const privateControls = document.getElementById("privateControls");

  if (mode === "room") {
    roomControls.style.display = "block";
    privateControls.style.display = "none";
  } else {
    roomControls.style.display = "none";
    privateControls.style.display = "block";
  }
}

// ---------- ROOM CHAT ----------

function joinRoom() {
  const room = document.getElementById("room").value;
  currentRoom = room;

  document.getElementById("currentRoom").innerText = room;
  document.getElementById("messages").innerHTML = "";
  document.getElementById("typingText").innerText = "";

  socket.emit("joinRoom", { room, username });

  // load room history
  fetch(`/api/messages/${encodeURIComponent(room)}`)
    .then((r) => r.json())
    .then((msgs) => {
      msgs.forEach((m) => addMessage(`${m.from_user}: ${m.message}`));
    })
    .catch((e) => alert("Room history load failed: " + e.message));
}

function leaveRoom() {
  socket.emit("leaveRoom");
  currentRoom = null;
  document.getElementById("currentRoom").innerText = "None";
  document.getElementById("typingText").innerText = "";
  addMessage("You left the room.");
}

// ---------- PRIVATE CHAT ----------

function loadPrivateHistory() {
  const toUser = document.getElementById("toUser").value.trim();
  if (!toUser) return alert("Enter a username to chat with.");

  currentPrivateUser = toUser;
  document.getElementById("currentPrivate").innerText = toUser;

  document.getElementById("messages").innerHTML = "";
  document.getElementById("typingText").innerText = "";

  fetch(`/api/private/${encodeURIComponent(username)}/${encodeURIComponent(toUser)}`)
    .then((r) => r.json())
    .then((msgs) => {
      msgs.forEach((m) => {
        addMessage(`[PRIVATE] ${m.from_user} -> ${m.to_user}: ${m.message}`);
      });
    })
    .catch((e) => alert("Private history load failed: " + e.message));
}

// ---------- SEND MESSAGE (room or private) ----------

function sendMessage() {
  const input = document.getElementById("messageInput");
  const message = input.value.trim();
  if (!message) return;

  if (mode === "room") {
    if (!currentRoom) return alert("Join a room first!");
    socket.emit("sendMessage", { room: currentRoom, username, message });
    socket.emit("stopTyping", { room: currentRoom });
  } else {
    if (!currentPrivateUser) return alert("Enter username and click Load Chat History first!");

    socket.emit("sendPrivate", { from_user: username, to_user: currentPrivateUser, message });

    // ✅ show instantly for sender (even if receiver offline)
    addMessage(`[PRIVATE] ${username} -> ${currentPrivateUser}: ${message}`);
  }

  input.value = "";
}

// ---------- TYPING INDICATOR (ROOM + PRIVATE) ----------

function handleTyping() {
  clearTimeout(typingTimer);

  if (mode === "room") {
    if (!currentRoom) return;

    socket.emit("typing", { room: currentRoom, username });

    typingTimer = setTimeout(() => {
      socket.emit("stopTyping", { room: currentRoom });
    }, 600);
  } else {
    // private typing
    if (!currentPrivateUser) return;

    socket.emit("typingPrivate", { from_user: username, to_user: currentPrivateUser });

    typingTimer = setTimeout(() => {
      socket.emit("stopTypingPrivate", { from_user: username, to_user: currentPrivateUser });
    }, 600);
  }
}

// show typing (room or private)
socket.on("typing", (data) => {
  // room typing: only show if in same room
  if (data.type === "room") {
    if (currentRoom && data.room === currentRoom) {
      document.getElementById("typingText").innerText = `${data.from} is typing...`;
    }
    return;
  }

  // private typing
  if (data.type === "private") {
    document.getElementById("typingText").innerText = `${data.from} is typing...`;
  }
});

// stop typing (room or private)
socket.on("stopTyping", (data) => {
  if (data.type === "room") {
    document.getElementById("typingText").innerText = "";
    return;
  }
  if (data.type === "private") {
    document.getElementById("typingText").innerText = "";
  }
});

// ---------- RECEIVE EVENTS ----------

function addMessage(text) {
  const box = document.getElementById("messages");
  const div = document.createElement("div");
  div.innerText = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

socket.on("receiveMessage", (data) => {
  addMessage(`${data.from_user}: ${data.message}`);
});

socket.on("systemMessage", (text) => {
  addMessage(`[SYSTEM] ${text}`);
});

socket.on("receivePrivate", (data) => {
  // avoid double-print: we already printed sender-side instantly
  if (data.from_user === username) return;
  addMessage(`[PRIVATE] ${data.from_user} -> ${data.to_user}: ${data.message}`);
});
