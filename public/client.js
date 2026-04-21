// ========== Глобальные переменные ==========
let ws = null;
let currentUser = null;
let currentRoom = 'general';
let typingTimeout = null;
let notificationPermission = false;
let unreadCount = 0;

// ========== Подключение к чату ==========
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
        
        setTimeout(() => {
            addEmojiButton();
            addImageButton();
        }, 500);
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

// ========== Обработка сообщений ==========
function handleMessage(data) {
    switch(data.type) {
        case 'message':
            displayMessage(data);
            showNotification(data.username, data.content);
            break;
        case 'image':
            displayImageMessage(data);
            break;
        case 'reaction':
            displayReaction(data);
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

// ========== Отображение текстовых сообщений ==========
function displayMessage(message) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.isSystem ? 'system' : ''}`;
    messageDiv.id = `msg-${message.id}`;
    
    if (message.isSystem) {
        messageDiv.innerHTML = `<div class="message-content">${escapeHtml(message.content)}</div>`;
    } else {
        const time = new Date(message.timestamp).toLocaleTimeString();
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="message-username">${escapeHtml(message.username)}</span>
                <span> ${time}</span>
            </div>
            <div class="message-content">${escapeHtml(message.content)}</div>
            <div class="reactions-container" id="reactions-${message.id}" style="margin-top: 5px;"></div>
        `;
        addReactionButtons(message.id);
    }
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ========== Отображение изображений ==========
function displayImageMessage(message) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.id = `msg-${message.id}`;
    
    const time = new Date(message.timestamp).toLocaleTimeString();
    messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-username">${escapeHtml(message.username)}</span>
            <span> ${time}</span>
        </div>
        <img src="${message.imageData}" style="max-width: 250px; max-height: 250px; border-radius: 10px; margin-top: 5px; cursor: pointer;" onclick="window.open('${message.imageData}', '_blank')">
        ${message.caption ? `<div style="margin-top: 5px; color: #666;">${escapeHtml(message.caption)}</div>` : ''}
        <div class="reactions-container" id="reactions-${message.id}" style="margin-top: 5px;"></div>
    `;
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    addReactionButtons(message.id);
}

// ========== История сообщений ==========
function displayHistory(messages) {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML = '';
    messages.forEach(message => {
        if (message.type === 'image') {
            displayImageMessage(message);
        } else {
            displayMessage(message);
        }
    });
}

// ========== РЕАКЦИИ ==========
function addReactionButtons(messageId) {
    const reactionsDiv = document.getElementById(`reactions-${messageId}`);
    if (!reactionsDiv) return;
    
    const reactions = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
    reactions.forEach(reaction => {
        const btn = document.createElement('button');
        btn.textContent = reaction;
        btn.style.margin = '2px';
        btn.style.padding = '2px 8px';
        btn.style.border = 'none';
        btn.style.borderRadius = '12px';
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '14px';
        btn.style.backgroundColor = '#e9ecef';
        btn.onclick = () => addReaction(messageId, reaction);
        reactionsDiv.appendChild(btn);
    });
}

function addReaction(messageId, reaction) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.log('WebSocket не подключен');
        return;
    }
    
    ws.send(JSON.stringify({
        type: 'reaction',
        messageId: messageId,
        reaction: reaction,
        username: currentUser
    }));
}

function displayReaction(reaction) {
    const messageDiv = document.getElementById(`msg-${reaction.messageId}`);
    if (!messageDiv) {
        console.log('Сообщение не найдено:', reaction.messageId);
        return;
    }
    
    let container = messageDiv.querySelector('.reactions-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'reactions-container';
        container.style.marginTop = '5px';
        messageDiv.appendChild(container);
    }
    
    // Удаляем старую реакцию этого пользователя
    const oldReaction = container.querySelector(`.reaction-${reaction.username}`);
    if (oldReaction) oldReaction.remove();
    
    // Добавляем новую
    const reactionSpan = document.createElement('span');
    reactionSpan.className = `reaction-${reaction.username}`;
    reactionSpan.textContent = `${reaction.reaction} ${reaction.username}`;
    reactionSpan.style.marginRight = '8px';
    reactionSpan.style.fontSize = '12px';
    reactionSpan.style.backgroundColor = '#e9ecef';
    reactionSpan.style.padding = '2px 8px';
    reactionSpan.style.borderRadius = '12px';
    reactionSpan.style.display = 'inline-block';
    
    container.appendChild(reactionSpan);
    
    console.log(`Реакция ${reaction.reaction} от ${reaction.username} отображена`);
}

// ========== Список пользователей ==========
function updateUserList(users) {
    const usersList = document.getElementById('users');
    usersList.innerHTML = users.map(user => `<li>${escapeHtml(user)}</li>`).join('');
}

// ========== Индикатор набора текста ==========
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

// ========== Отправка сообщений ==========
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

// ========== Отправка изображений ==========
function sendImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file.size > 5 * 1024 * 1024) {
            alert('Изображение не должно превышать 5 МБ');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            ws.send(JSON.stringify({
                type: 'image',
                imageData: event.target.result,
                caption: ''
            }));
        };
        reader.readAsDataURL(file);
    };
    
    input.click();
}

// ========== Эмодзи-пикер ==========
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
        emojiBtn.style.fontSize = '18px';
        emojiBtn.onclick = toggleEmojiPicker;
        messageInput.insertBefore(emojiBtn, messageInput.firstChild);
    }
}

function addImageButton() {
    const messageInput = document.querySelector('.message-input');
    if (messageInput && !document.getElementById('imageBtn')) {
        const imageBtn = document.createElement('button');
        imageBtn.id = 'imageBtn';
        imageBtn.textContent = '📷';
        imageBtn.style.marginRight = '10px';
        imageBtn.style.padding = '10px 15px';
        imageBtn.style.borderRadius = '5px';
        imageBtn.style.border = 'none';
        imageBtn.style.cursor = 'pointer';
        imageBtn.style.fontSize = '18px';
        imageBtn.onclick = sendImage;
        const emojiBtn = document.getElementById('emojiBtn');
        if (emojiBtn) {
            messageInput.insertBefore(imageBtn, emojiBtn.nextSibling);
        } else {
            messageInput.insertBefore(imageBtn, messageInput.firstChild);
        }
    }
}

// ========== Смена комнаты ==========
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

// ========== Уведомления ==========
function requestNotificationPermission() {
    if ('Notification' in window) {
        Notification.requestPermission().then(permission => {
            notificationPermission = permission === 'granted';
        });
    }
}

function showNotification(sender, message) {
    if (notificationPermission && document.hidden) {
        new Notification(`Новое сообщение от ${sender}`, {
            body: message.length > 50 ? message.slice(0, 50) + '...' : message,
            icon: 'https://img.icons8.com/color/96/chat.png',
            vibrate: [200, 100, 200]
        });
        
        unreadCount++;
        document.title = `(${unreadCount}) Чат`;
    }
}

window.addEventListener('focus', () => {
    unreadCount = 0;
    document.title = 'Чат';
});

// ========== Вспомогательные функции ==========
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Запуск
requestNotificationPermission();

document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', handleKeyPress);
    }
});