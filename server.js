const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Раздаём статические файлы из папки public
app.use(express.static('public'));

// Хранилище данных
const rooms = {
  'general': { clients: new Map(), messages: [] } // Map: ws -> username
};
const MAX_MESSAGES = 100; // храним только последние 100 сообщений

// Генерация уникального ID для сообщений
function generateMessageId() {
  return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// Отправка сообщения всем в комнате
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

// Отправка списка пользователей
function updateUserList(roomName) {
  const room = rooms[roomName];
  if (!room) return;
  
  const users = Array.from(room.clients.values());
  const userListMessage = JSON.stringify({
    type: 'user_list',
    users: users
  });
  
  room.clients.forEach((_, clientWs) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(userListMessage);
    }
  });
}

// Обработка WebSocket соединений
wss.on('connection', (ws) => {
  console.log('Новое соединение');
  let currentRoom = 'general';
  let username = null;
  
  // Отправляем историю сообщений
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
      console.log('Получено:', message.type);
      
      switch(message.type) {
        case 'join':
          username = message.username;
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
          if (!username) return;
          
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
          
        case 'typing':
          const typingMessage = {
            type: 'typing',
            username: username,
            isTyping: message.isTyping
          };
          broadcastToRoom(currentRoom, ws, typingMessage, false);
          break;
          
        case 'change_room':
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
          
        // ========== РЕАКЦИИ - НОВЫЙ ОБРАБОТЧИК ==========
        case 'reaction':
          console.log(`👍 Реакция от ${username}: ${message.reaction} на сообщение ${message.messageId}`);
          
          const reactionBroadcast = {
            type: 'reaction',
            messageId: message.messageId,
            reaction: message.reaction,
            username: username,
            timestamp: new Date().toISOString()
          };
          broadcastToRoom(currentRoom, ws, reactionBroadcast);
          break;
          
        // ========== ИЗОБРАЖЕНИЯ ==========
        case 'image':
          if (!username) return;
          
          const imageMessage = {
            type: 'image',
            id: generateMessageId(),
            username: username,
            imageData: message.imageData,
            caption: message.caption || '',
            timestamp: new Date().toISOString(),
            isSystem: false
          };
          
          const imgRoom = rooms[currentRoom];
          imgRoom.messages.push(imageMessage);
          if (imgRoom.messages.length > MAX_MESSAGES) {
            imgRoom.messages.shift();
          }
          
          broadcastToRoom(currentRoom, ws, imageMessage);
          break;
      }
    } catch (error) {
      console.error('Ошибка обработки сообщения:', error);
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
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});