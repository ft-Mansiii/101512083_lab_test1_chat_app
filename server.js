require("dotenv").config();
const express = require("express");
const http = require("http");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");

const User = require("./models/User");
const GroupMessage = require("./models/GroupMessage");

const app = express();
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/views", express.static(path.join(__dirname, "views")));


app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "login.html"));
});


mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log("MongoDB error:", err.message));

// ------------------ APIs ------------------

// SIGNUP
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
    // unique username error
    return res.status(400).json({ error: "Username already exists" });
  }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username, password });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  res.json({ message: "Login success", username: user.username });
});


app.get("/api/messages/:room", async (req, res) => {
  const room = req.params.room;
  const msgs = await GroupMessage.find({ room }).sort({ date_sent: 1 }).limit(100);
  res.json(msgs);
});

// ------------------ SOCKET.IO ------------------

io.on("connection", (socket) => {
  console.log(" User connected:", socket.id);

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
    socket.to(room).emit("typing", `${username} is typing...`);
  });

  socket.on("stopTyping", ({ room }) => {
    socket.to(room).emit("typing", "");
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

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

server.listen(3000, () => {
  console.log("Server running: http://localhost:3000");
});


