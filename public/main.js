const socket = io();

const username = localStorage.getItem("username");
if (!username) {
  window.location.href = "/views/login.html";
}

document.getElementById("who").innerText = `Logged in as: ${username}`;

let currentRoom = null;
let typingTimer = null;

function logout() {
  localStorage.removeItem("username");
  window.location.href = "/views/login.html";
}

function joinRoom() {
  const room = document.getElementById("room").value;
  currentRoom = room;

  document.getElementById("currentRoom").innerText = room;
  document.getElementById("messages").innerHTML = "";

  socket.emit("joinRoom", { room, username });

  
  fetch(`/api/messages/${encodeURIComponent(room)}`)
    .then((r) => r.json())
    .then((msgs) => {
      msgs.forEach((m) => addMessage(`${m.from_user}: ${m.message}`));
    });
}

function leaveRoom() {
  socket.emit("leaveRoom");
  currentRoom = null;
  document.getElementById("currentRoom").innerText = "None";
  document.getElementById("typingText").innerText = "";
  addMessage("You left the room.");
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  const message = input.value.trim();
  if (!message) return;

  if (!currentRoom) {
    alert("Join a room first!");
    return;
  }

  socket.emit("sendMessage", { room: currentRoom, username, message });
  input.value = "";
  socket.emit("stopTyping", { room: currentRoom });
}

function addMessage(text) {
  const box = document.getElementById("messages");
  const p = document.createElement("div");
  p.innerText = text;
  box.appendChild(p);
  box.scrollTop = box.scrollHeight;
}

socket.on("receiveMessage", (data) => {
  addMessage(`${data.from_user}: ${data.message}`);
});

socket.on("systemMessage", (text) => {
  addMessage(`[SYSTEM] ${text}`);
});


function handleTyping() {
  if (!currentRoom) return;

  socket.emit("typing", { room: currentRoom, username });

  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket.emit("stopTyping", { room: currentRoom });
  }, 600);
}

socket.on("typing", (text) => {
  document.getElementById("typingText").innerText = text || "";
});
