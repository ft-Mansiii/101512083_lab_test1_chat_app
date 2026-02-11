require("dotenv").config();

const express = require("express");
const http = require("http");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");

const User = require("./models/User");
const GroupMessage = require("./models/GroupMessage");
const PrivateMessage = require("./models/PrivateMessage");

const app = express();
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// static
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/views", express.static(path.join(__dirname, "views")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "login.html"));
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Atlas connected"))
  .catch((err) => console.log("Mongo Error:", err.message));

// ------------------ REST APIs ------------------

app.post("/api/signup", async (req, res) => {
  try {
    const { username, firstname, lastname, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "username and password required" });
    }

    const user = new User({ username, firstname, lastname, password });
    await user.save();
    res.json({ message: "Signup success" });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: "Username already exists" });
    }
    return res.status(500).json({ error: "Server error: " + err.message });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username, password });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    res.json({ message: "Login success", username: user.username });
  } catch (err) {
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

app.get("/api/messages/:room", async (req, res) => {
  try {
    const room = req.params.room;
    const msgs = await GroupMessage.find({ room }).sort({ date_sent: 1 }).limit(200);
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

app.get("/api/private/:userA/:userB", async (req, res) => {
  try {
    const { userA, userB } = req.params;

    const msgs = await PrivateMessage.find({
      $or: [
        { from_user: userA, to_user: userB },
        { from_user: userB, to_user: userA },
      ],
    })
      .sort({ date_sent: 1 })
      .limit(200);

    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// ------------------ SOCKET.IO ------------------

const onlineUsers = {}; 

io.on("connection", (socket) => {
  console.log("connected:", socket.id);

  socket.on("registerUser", (username) => {
  socket.username = username;
  onlineUsers[username] = socket.id;
  console.log("registered:", username, socket.id);
});


  socket.on("joinRoom", ({ room, username }) => {
    socket.join(room);
    socket.currentRoom = room;
    socket.username = username;

    socket.to(room).emit("systemMessage", `${username} joined ${room}`);
  });

  socket.on("leaveRoom", () => {
    const room = socket.currentRoom;
    if (!room) return;

    socket.leave(room);
    socket.to(room).emit("systemMessage", `${socket.username} left ${room}`);
    socket.currentRoom = null;
  });

  
socket.on("typing", ({ room, username }) => {
  if (!room) return;
  socket.to(room).emit("typing", { type: "room", room, from: username });
});

socket.on("stopTyping", ({ room }) => {
  if (!room) return;
  socket.to(room).emit("stopTyping", { type: "room", room });
});

socket.on("typingPrivate", ({ from_user, to_user }) => {
  const toSocketId = onlineUsers[to_user];
  if (toSocketId) {
    io.to(toSocketId).emit("typing", { type: "private", from: from_user });
  }
});

socket.on("stopTypingPrivate", ({ from_user, to_user }) => {
  const toSocketId = onlineUsers[to_user];
  if (toSocketId) {
    io.to(toSocketId).emit("stopTyping", { type: "private", from: from_user });
  }
});


  socket.on("sendMessage", async ({ room, username, message }) => {
    if (!room || !username || !message) return;

    const msgDoc = new GroupMessage({
      from_user: username,
      room,
      message,
    });
    await msgDoc.save();

    io.to(room).emit("receiveMessage", {
      from_user: username,
      room,
      message,
      date_sent: msgDoc.date_sent,
    });
  });

  socket.on("sendPrivate", async ({ from_user, to_user, message }) => {
    if (!from_user || !to_user || !message) return;

    const pm = new PrivateMessage({ from_user, to_user, message });
    await pm.save();

    const payload = {
      from_user,
      to_user,
      message,
      date_sent: pm.date_sent,
    };

    const toSocketId = onlineUsers[to_user];
    if (toSocketId) {
      io.to(toSocketId).emit("receivePrivate", payload);
    }

    socket.emit("receivePrivate", payload);
  });

  socket.on("disconnect", () => {
    console.log("disconnected:", socket.id);
    if (socket.username && onlineUsers[socket.username]) {
      delete onlineUsers[socket.username];
    }
  });
});

server.listen(3000, () => {
  console.log("Server running: http://localhost:3000");
});
