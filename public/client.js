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
