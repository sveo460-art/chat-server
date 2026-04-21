let ws = null;
let currentUser = null;
let currentRoom = 'general';
let typingTimeout = null;

function joinChat() {
    const username = document.getElementById('usernameInput').value.trim();
    if (!username) {
        alert('Введите имя пользователя');
        return;
    }
    
    currentUser = username;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    ws.onopen = () => {
        console.log('Подключено к WebSocket');
        
        ws.send(JSON.stringify({
            type: 'join',
            username: currentUser,
            room: currentRoom
        }));
        
        document.getElementById('joinScreen').style.display = 'none';
        document.getElementById('chatContainer').style.display = 'flex';
        document.getElementById('currentUser').textContent = currentUser;
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleMessage(data);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket ошибка:', error);
        alert('Ошибка соединения');
    };
    
    ws.onclose = () => {
        console.log('Соединение закрыто');
        if (confirm('Соединение потеряно. Перезагрузить страницу?')) {
            location.reload();
        }
    };
}

function handleMessage(data) {
    switch(data.type) {
        case 'message':
            displayMessage(data);
            break;
        case 'history':
            displayHistory(data.messages);
            break;
        case 'user_list':
            updateUserList(data.users);
            break;
        case 'typing':
            showTypingIndicator(data.username, data.isTyping);
            break;
        case 'room_changed':
            currentRoom = data.room;
            highlightActiveRoom();
            break;
    }
}

function displayMessage(message) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.isSystem ? 'system' : ''}`;
    
    if (message.isSystem) {
        messageDiv.innerHTML = `<div class="message-content">${message.content}</div>`;
    } else {
        const time = new Date(message.timestamp).toLocaleTimeString();
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="message-username">${escapeHtml(message.username)}</span>
                <span> ${time}</span>
            </div>
            <div class="message-content">${escapeHtml(message.content)}</div>
        `;
    }
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function displayHistory(messages) {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML = '';
    messages.forEach(message => displayMessage(message));
}

function updateUserList(users) {
    const usersList = document.getElementById('users');
    usersList.innerHTML = users.map(user => `<li>${escapeHtml(user)}</li>`).join('');
}

let typingTimeoutId = null;
let isTyping = false;

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    } else {
        if (!isTyping) {
            isTyping = true;
            ws.send(JSON.stringify({
                type: 'typing',
                isTyping: true
            }));
        }
        
        clearTimeout(typingTimeoutId);
        typingTimeoutId = setTimeout(() => {
            isTyping = false;
            ws.send(JSON.stringify({
                type: 'typing',
                isTyping: false
            }));
        }, 1000);
    }
}

function showTypingIndicator(username, typing) {
    const indicator = document.getElementById('typingIndicator');
    if (typing && username !== currentUser) {
        indicator.textContent = `${username} печатает...`;
    } else {
        indicator.textContent = '';
    }
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    
    if (!content) return;
    
    ws.send(JSON.stringify({
        type: 'message',
        content: content
    }));
    
    input.value = '';
}

function changeRoom(room) {
    if (room === currentRoom) return;
    
    ws.send(JSON.stringify({
        type: 'change_room',
        room: room
    }));
}

function highlightActiveRoom() {
    document.querySelectorAll('.room-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.includes(currentRoom)) {
            btn.classList.add('active');
        }
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
// Уведомления о новых сообщениях
let notificationPermission = false;
let unreadCount = 0;

// Запрос разрешения на уведомления
function requestNotificationPermission() {
  if ('Notification' in window) {
    Notification.requestPermission().then(permission => {
      notificationPermission = permission === 'granted';
    });
  }
}

// Показ уведомления
function showNotification(sender, message) {
  if (notificationPermission && document.hidden) {
    new Notification(`Новое сообщение от ${sender}`, {
      body: message.length > 50 ? message.slice(0, 50) + '...' : message,
      icon: 'https://img.icons8.com/color/96/chat.png',
      badge: 'https://img.icons8.com/color/96/chat.png',
      vibrate: [200, 100, 200]
    });
    
    // Обновляем заголовок страницы
    unreadCount++;
    document.title = `(${unreadCount}) Чат`;
  }
}

// Сброс счётчика при фокусе на странице
window.addEventListener('focus', () => {
  unreadCount = 0;
  document.title = 'Чат';
});

// Запрашиваем разрешение при загрузке
requestNotificationPermission();

// Измените функцию displayMessage, добавив в неё уведомление:
const originalDisplayMessage = displayMessage;
displayMessage = function(message) {
  originalDisplayMessage(message);
  if (!message.isSystem && message.username !== currentUser) {
    showNotification(message.username, message.content);
  }
};
// Эмодзи пикер
let emojiPickerVisible = false;

function toggleEmojiPicker() {
  const picker = document.getElementById('emojiPicker');
  if (!picker) return;
  
  emojiPickerVisible = !emojiPickerVisible;
  picker.style.display = emojiPickerVisible ? 'block' : 'none';
  
  if (emojiPickerVisible) {
    picker.addEventListener('emoji-click', event => {
      const input = document.getElementById('messageInput');
      input.value += event.detail.unicode;
      input.focus();
      toggleEmojiPicker();
    });
  }
}

// Добавьте кнопку эмодзи в интерфейс (в HTML или через JS)
function addEmojiButton() {
  const messageInput = document.querySelector('.message-input');
  if (messageInput && !document.getElementById('emojiBtn')) {
    const emojiBtn = document.createElement('button');
    emojiBtn.id = 'emojiBtn';
    emojiBtn.textContent = '😊';
    emojiBtn.style.marginRight = '10px';
    emojiBtn.style.padding = '10px 15px';
    emojiBtn.style.borderRadius = '5px';
    emojiBtn.style.border = 'none';
    emojiBtn.style.cursor = 'pointer';
    emojiBtn.onclick = toggleEmojiPicker;
    messageInput.insertBefore(emojiBtn, messageInput.firstChild);
  }
}

// Вызовите при загрузке
setTimeout(addEmojiButton, 1000);