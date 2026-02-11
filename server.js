const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Хранилище данных в памяти сервера
const users = new Map(); // Map<userId, {username, socketId}>
const messages = new Map(); // Map<chatId, [messages]>

io.on('connection', (socket) => {
  console.log('Новое подключение:', socket.id);

  // Регистрация пользователя
  socket.on('register', (data) => {
    const { userId, username } = data;
    users.set(userId, {
      username,
      socketId: socket.id,
      lastSeen: new Date()
    });
    socket.userId = userId;
    console.log(`Пользователь зарегистрирован: ${username} (${userId})`);
    
    // Отправляем подтверждение
    socket.emit('registered', { userId, username });
    
    // Уведомляем всех о новом пользователе
    io.emit('userUpdate', Array.from(users.values()));
  });

  // Получение списка пользователей
  socket.on('getUsers', () => {
    const userList = Array.from(users.values()).map(user => ({
      id: user.userId,
      username: user.username
    }));
    socket.emit('userList', userList);
  });

  // Отправка сообщения
  socket.on('sendMessage', (data) => {
    const { from, to, text } = data;
    const message = {
      from,
      to,
      text,
      timestamp: new Date().toISOString(),
      read: false
    };

    // Сохраняем сообщение
    const chatId = [from, to].sort().join('_');
    if (!messages.has(chatId)) {
      messages.set(chatId, []);
    }
    messages.get(chatId).push(message);

    // Отправляем получателю, если он онлайн
    const receiver = users.get(to);
    if (receiver) {
      io.to(receiver.socketId).emit('newMessage', message);
    }

    // Подтверждение отправителю
    socket.emit('messageSent', message);
  });

  // Получение истории сообщений
  socket.on('getMessages', (data) => {
    const { userId, otherUserId } = data;
    const chatId = [userId, otherUserId].sort().join('_');
    const chatMessages = messages.get(chatId) || [];
    socket.emit('messageHistory', chatMessages);
  });

  // Отключение пользователя
  socket.on('disconnect', () => {
    if (socket.userId) {
      const user = users.get(socket.userId);
      if (user) {
        user.lastSeen = new Date();
        console.log(`Пользователь отключился: ${user.username}`);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
