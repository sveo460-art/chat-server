const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

const users = {};
const rooms = {
  'general': { clients: new Map(), messages: [] }
};
const MAX_MESSAGES = 100;

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateMessageId() {
  return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

function broadcastToRoom(roomName, senderWs, message, includeSelf = true) {
  const room = rooms[roomName];
  if (!room) return;
  
  const messageStr = JSON.stringify(message);
  room.clients.forEach((username, clientWs) => {
    if (includeSelf || clientWs !== senderWs) {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(messageStr);
      }
    }
  });
}

function updateUserList(roomName) {
  const room = rooms[roomName];
  if (!room) return;
  
  const userList = Array.from(room.clients.values());
  const userListMessage = JSON.stringify({
    type: 'user_list',
    users: userList
  });
  
  room.clients.forEach((_, clientWs) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(userListMessage);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('Новое соединение');
  let currentRoom = 'general';
  let username = null;
  let isAuthenticated = false;
  
  const sendMessageHistory = (roomName) => {
    const room = rooms[roomName];
    if (room && room.messages.length > 0) {
      ws.send(JSON.stringify({
        type: 'history',
        messages: room.messages
      }));
    }
  };
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      switch(message.type) {
        case 'register':
          if (users[message.username]) {
            ws.send(JSON.stringify({
              type: 'auth_error',
              error: 'Пользователь уже существует'
            }));
            return;
          }
          
          users[message.username] = {
            password: hashPassword(message.password),
            createdAt: new Date().toISOString()
          };
          
          ws.send(JSON.stringify({
            type: 'auth_success',
            message: 'Регистрация успешна'
          }));
          break;
          
        case 'login':
          if (!users[message.username]) {
            ws.send(JSON.stringify({
              type: 'auth_error',
              error: 'Пользователь не найден'
            }));
            return;
          }
          
          if (users[message.username].password !== hashPassword(message.password)) {
            ws.send(JSON.stringify({
              type: 'auth_error',
              error: 'Неверный пароль'
            }));
            return;
          }
          
          isAuthenticated = true;
          username = message.username;
          
          ws.send(JSON.stringify({
            type: 'auth_success',
            message: 'Вход выполнен'
          }));
          break;
          
        case 'join':
          if (!isAuthenticated) return;
          
          currentRoom = message.room || 'general';
          
          if (!rooms[currentRoom]) {
            rooms[currentRoom] = { clients: new Map(), messages: [] };
          }
          
          rooms[currentRoom].clients.set(ws, username);
          sendMessageHistory(currentRoom);
          
          const joinMessage = {
            type: 'message',
            id: generateMessageId(),
            username: 'Система',
            content: `${username} присоединился к чату`,
            timestamp: new Date().toISOString(),
            isSystem: true
          };
          rooms[currentRoom].messages.push(joinMessage);
          broadcastToRoom(currentRoom, ws, joinMessage);
          updateUserList(currentRoom);
          break;
          
        case 'message':
          if (!isAuthenticated) return;
          
          const chatMessage = {
            type: 'message',
            id: generateMessageId(),
            username: username,
            content: message.content,
            timestamp: new Date().toISOString(),
            isSystem: false
          };
          
          const room = rooms[currentRoom];
          room.messages.push(chatMessage);
          if (room.messages.length > MAX_MESSAGES) {
            room.messages.shift();
          }
          
          broadcastToRoom(currentRoom, ws, chatMessage);
          break;
          
        case 'change_room':
          if (!isAuthenticated) return;
          
          const oldRoom = currentRoom;
          const newRoom = message.room;
          
          if (rooms[oldRoom]) {
            rooms[oldRoom].clients.delete(ws);
            updateUserList(oldRoom);
            
            const leaveMessage = {
              type: 'message',
              id: generateMessageId(),
              username: 'Система',
              content: `${username} покинул комнату`,
              timestamp: new Date().toISOString(),
              isSystem: true
            };
            rooms[oldRoom].messages.push(leaveMessage);
            broadcastToRoom(oldRoom, ws, leaveMessage);
          }
          
          currentRoom = newRoom;
          if (!rooms[currentRoom]) {
            rooms[currentRoom] = { clients: new Map(), messages: [] };
          }
          rooms[currentRoom].clients.set(ws, username);
          sendMessageHistory(currentRoom);
          
          const joinNewMessage = {
            type: 'message',
            id: generateMessageId(),
            username: 'Система',
            content: `${username} присоединился к комнате ${currentRoom}`,
            timestamp: new Date().toISOString(),
            isSystem: true
          };
          rooms[currentRoom].messages.push(joinNewMessage);
          broadcastToRoom(currentRoom, ws, joinNewMessage);
          updateUserList(currentRoom);
          
          ws.send(JSON.stringify({
            type: 'room_changed',
            room: currentRoom
          }));
          break;
      }
    } catch (error) {
      console.error('Ошибка:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('Соединение закрыто');
    if (username && rooms[currentRoom]) {
      rooms[currentRoom].clients.delete(ws);
      updateUserList(currentRoom);
      
      const leaveMessage = {
        type: 'message',
        id: generateMessageId(),
        username: 'Система',
        content: `${username} покинул чат`,
        timestamp: new Date().toISOString(),
        isSystem: true
      };
      rooms[currentRoom].messages.push(leaveMessage);
      broadcastToRoom(currentRoom, ws, leaveMessage);
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket ошибка:', error);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
