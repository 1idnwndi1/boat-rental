// DOM элементы
const authPanel = document.getElementById('auth-panel');
const boatsContainer = document.getElementById('boats-list');
const myRentalsDiv = document.getElementById('my-rentals');
const rentalsListDiv = document.getElementById('rentals-list');
const adminPanel = document.getElementById('admin-panel');
const usersListDiv = document.getElementById('users-list');
const adminBoatsDiv = document.getElementById('admin-boats-list');

let currentUser = null;

// Вспомогательные функции
function getToken() { return localStorage.getItem('token'); }
function saveToken(token) { token ? localStorage.setItem('token', token) : localStorage.removeItem('token'); }
function decodeToken(token) { try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; } }

async function apiRequest(url, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...(token && { 'Authorization': `Bearer ${token}` }) };
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Ошибка');
    }
    return res.json();
}

// Рисуем панель авторизации (кнопки появляются сразу)
function renderAuthPanel() {
    const token = getToken();
    if (token) {
        const payload = decodeToken(token);
        currentUser = payload;
        authPanel.innerHTML = `
            <span>${payload.email} (${payload.role === 'admin' ? 'Админ' : 'Пользователь'})</span>
            <button id="logout-btn">Выйти</button>
            <button id="show-rentals-btn">Мои аренды</button>
        `;
        document.getElementById('logout-btn')?.addEventListener('click', () => {
            saveToken(null);
            location.reload();
        });
        document.getElementById('show-rentals-btn')?.addEventListener('click', () => {
            myRentalsDiv.style.display = 'block';
            loadMyRentals();
        });
        if (payload.role === 'admin') {
            adminPanel.style.display = 'block';
            initAdminPanel();
        } else {
            adminPanel.style.display = 'none';
        }
    } else {
        currentUser = null;
        authPanel.innerHTML = `
            <button id="login-btn">Вход</button>
            <button id="register-btn">Регистрация</button>
        `;
        document.getElementById('login-btn')?.addEventListener('click', showLogin);
        document.getElementById('register-btn')?.addEventListener('click', showRegister);
        myRentalsDiv.style.display = 'none';
        adminPanel.style.display = 'none';
    }
}

function showLogin() {
    const email = prompt('Email:');
    if (!email) return;
    const password = prompt('Пароль:');
    if (!password) return;
    login(email, password);
}

function showRegister() {
    const name = prompt('Имя:');
    if (!name) return;
    const email = prompt('Email:');
    if (!email) return;
    const password = prompt('Пароль (минимум 6 символов):');
    if (!password || password.length < 6) return alert('Слишком короткий пароль');
    const age = prompt('Возраст (необязательно):');
    register(name, email, password, age ? parseInt(age) : undefined);
}

async function login(email, password) {
    try {
        const data = await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        saveToken(data.token);
        alert('Вход выполнен');
        location.reload();
    } catch(e) { alert('Ошибка: ' + e.message); }
}

async function register(name, email, password, age) {
    try {
        const data = await apiRequest('/users', { method: 'POST', body: JSON.stringify({ name, email, password, age }) });
        saveToken(data.token);
        alert('Регистрация успешна');
        location.reload();
    } catch(e) { alert('Ошибка: ' + e.message); }
}

// Загрузка кораблей
async function loadBoats() {
    try {
        const boats = await apiRequest('/boats');
        if (!boats.length) {
            boatsContainer.innerHTML = '<p>Нет кораблей. Добавьте через админ-панель (admin@example.com / admin123)</p>';
            return;
        }
        boatsContainer.innerHTML = boats.map(boat => `
            <div class="boat-card">
                <h3>${boat.name}</h3>
                <div>${boat.type}</div>
                <div class="price">${boat.pricePerHour} ₽/час</div>
                ${getToken() ? `<button data-id="${boat.id}">Арендовать</button>` : ''}
            </div>
        `).join('');
        document.querySelectorAll('.boat-card button').forEach(btn => {
            btn.addEventListener('click', () => rentBoat(btn.dataset.id));
        });
    } catch(e) { boatsContainer.innerHTML = '<p>Ошибка загрузки кораблей</p>'; }
}

async function rentBoat(boatId) {
    const hours = parseInt(prompt('Часы:', '2'));
    if (isNaN(hours) || hours < 1) return;
    const date = prompt('Дата (ГГГГ-ММ-ДД):', new Date().toISOString().slice(0,10));
    if (!date) return;
    try {
        await apiRequest('/rentals', { method: 'POST', body: JSON.stringify({ boatId, hours, date }) });
        alert('Забронировано!');
        loadMyRentals();
        myRentalsDiv.style.display = 'block';
    } catch(e) { alert('Ошибка: ' + e.message); }
}

async function loadMyRentals() {
    if (!getToken()) return;
    try {
        const rentals = await apiRequest('/rentals');
        if (!rentals.length) { rentalsListDiv.innerHTML = '<p>Нет аренд</p>'; return; }
        rentalsListDiv.innerHTML = rentals.map(r => `
            <div class="rental-card">
                <strong>${r.boatName}</strong> | ${r.hours} ч | ${r.date} | ${r.totalPrice} ₽
                <button data-id="${r.id}">Отменить</button>
            </div>
        `).join('');
        document.querySelectorAll('#rentals-list button').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('Отменить бронь?')) {
                    await apiRequest(`/rentals/${btn.dataset.id}`, { method: 'DELETE' });
                    loadMyRentals();
                }
            });
        });
    } catch(e) { rentalsListDiv.innerHTML = '<p>Ошибка</p>'; }
}

// Админка
function initAdminPanel() {
    document.getElementById('show-users')?.addEventListener('click', async () => {
        try {
            const users = await apiRequest('/users');
            usersListDiv.innerHTML = users.map(u => `<div>${u.name} (${u.email}) ${u.age ? `, ${u.age} лет` : ''} — ${u.role}</div>`).join('');
        } catch(e) { usersListDiv.innerHTML = '<p>Ошибка</p>'; }
    });
    document.getElementById('add-boat')?.addEventListener('click', async () => {
        const name = document.getElementById('boat-name').value;
        const type = document.getElementById('boat-type').value;
        const price = parseInt(document.getElementById('boat-price').value);
        if (!name || !type || !price) return alert('Заполните все поля');
        try {
            await apiRequest('/boats', { method: 'POST', body: JSON.stringify({ name, type, pricePerHour: price }) });
            alert('Корабль добавлен');
            loadBoats();
            // обновить список в админке
            const boats = await apiRequest('/boats');
            adminBoatsDiv.innerHTML = boats.map(b => `<div><strong>${b.name}</strong> (${b.type}) ${b.pricePerHour} ₽</div>`).join('');
            document.getElementById('boat-name').value = '';
            document.getElementById('boat-type').value = '';
            document.getElementById('boat-price').value = '';
        } catch(e) { alert('Ошибка: ' + e.message); }
    });
    // загрузить список кораблей в админке
    (async () => {
        try {
            const boats = await apiRequest('/boats');
            adminBoatsDiv.innerHTML = boats.map(b => `<div><strong>${b.name}</strong> (${b.type}) ${b.pricePerHour} ₽</div>`).join('');
        } catch(e) {}
    })();
}

// Запуск
renderAuthPanel();
loadBoats();