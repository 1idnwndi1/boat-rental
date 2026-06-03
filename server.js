require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Хранилища
let users = [];
let boats = [];
let rentals = [];

// Инициализация
async function init() {
    // Админ
    if (!users.find(u => u.email === 'admin@example.com')) {
        const hash = await bcrypt.hash('admin123', 10);
        users.push({
            id: uuidv4(),
            name: 'Администратор',
            email: 'admin@example.com',
            age: 30,
            passwordHash: hash,
            role: 'admin'
        });
        console.log('✅ Админ создан');
    }
    // Тестовые корабли
    if (boats.length === 0) {
        boats.push(
            { id: uuidv4(), name: 'Яхта "Бриз"', type: 'яхта', pricePerHour: 5000, available: true },
            { id: uuidv4(), name: 'Катер "Стрела"', type: 'катер', pricePerHour: 2500, available: true },
            { id: uuidv4(), name: 'Лодка "Волна"', type: 'лодка', pricePerHour: 1000, available: true }
        );
        console.log('✅ Корабли добавлены');
    }
}
init();

function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
}

function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Недействительный токен' });
        req.user = user;
        next();
    });
}

function adminOnly(req, res, next) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Доступ только администратору' });
    next();
}

// API
app.post('/users', async (req, res) => {
    try {
        const { name, email, password, age } = req.body;
        if (!name || !email || !password) throw new Error('Имя, email и пароль обязательны');
        if (!/^[^\s@]+@([^\s@]+\.)+[^\s@]+$/.test(email)) throw new Error('Неверный формат email');
        if (users.find(u => u.email === email)) throw new Error('Email уже используется');
        if (password.length < 6) throw new Error('Пароль должен быть не менее 6 символов');
        const hash = await bcrypt.hash(password, 10);
        const newUser = {
            id: uuidv4(),
            name,
            email,
            age: age ? parseInt(age) : null,
            passwordHash: hash,
            role: 'user'
        };
        users.push(newUser);
        const token = generateToken(newUser);
        const { passwordHash, ...safeUser } = newUser;
        res.status(201).json({ user: safeUser, token });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email);
    if (!user) return res.status(401).json({ error: 'Неверный email или пароль' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Неверный email или пароль' });
    const token = generateToken(user);
    const { passwordHash, ...safeUser } = user;
    res.json({ token, user: safeUser });
});

app.get('/users', auth, adminOnly, (req, res) => {
    res.json(users.map(({ passwordHash, ...u }) => u));
});

app.get('/users/:id', auth, (req, res) => {
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    const { passwordHash, ...safeUser } = user;
    res.json(safeUser);
});

app.get('/boats', (req, res) => res.json(boats));

app.post('/boats', auth, adminOnly, (req, res) => {
    const { name, type, pricePerHour } = req.body;
    if (!name || !type || !pricePerHour) return res.status(400).json({ error: 'Заполните все поля' });
    const newBoat = { id: uuidv4(), name, type, pricePerHour: Number(pricePerHour), available: true };
    boats.push(newBoat);
    res.status(201).json(newBoat);
});

app.delete('/boats/:id', auth, adminOnly, (req, res) => {
    const idx = boats.findIndex(b => b.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Корабль не найден' });
    boats.splice(idx, 1);
    res.status(204).send();
});

app.post('/rentals', auth, (req, res) => {
    const { boatId, hours, date } = req.body;
    const boat = boats.find(b => b.id === boatId);
    if (!boat) return res.status(404).json({ error: 'Корабль не найден' });
    if (!boat.available) return res.status(400).json({ error: 'Корабль временно недоступен' });
    if (!hours || hours < 1) return res.status(400).json({ error: 'Укажите корректное количество часов' });
    const rental = {
        id: uuidv4(),
        userId: req.user.id,
        boatId,
        boatName: boat.name,
        hours: Number(hours),
        date: date || new Date().toISOString().slice(0,10),
        totalPrice: boat.pricePerHour * hours,
        createdAt: new Date()
    };
    rentals.push(rental);
    res.status(201).json(rental);
});

app.get('/rentals', auth, (req, res) => {
    if (req.user.role === 'admin') return res.json(rentals);
    res.json(rentals.filter(r => r.userId === req.user.id));
});

app.delete('/rentals/:id', auth, (req, res) => {
    const idx = rentals.findIndex(r => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Аренда не найдена' });
    if (rentals[idx].userId !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Нет прав на отмену' });
    }
    rentals.splice(idx, 1);
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚢 Сервер запущен: http://localhost:${PORT}`));