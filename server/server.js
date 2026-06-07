const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const db = require('./database');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = 'dgrkc-admin-secret-key-2026';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://generateur-fiscal.onrender.com';

// Middleware
app.use(cors({
  origin: [FRONTEND_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Middleware pour vérifier le JWT
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.adminId = decoded.adminId;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Token invalide' });
  }
}

// ============ API ADMIN LOGIN ============
app.post('/api/admin/login', async (req, res) => {
  try {
    const { password } = req.body;
    console.log('Admin login attempt:', { password, received: password ? password.trim() : 'empty' });
    if (password?.trim() !== '123456') {
      return res.status(401).json({ success: false, message: 'Mot de passe incorrect' });
    }

    const token = jwt.sign({ adminId: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ API UTILISATEURS (Login sans token) ============
app.post('/api/users/login', async (req, res) => {
  try {
    const { nom, code } = req.body;
    const user = await db.get(
      'SELECT * FROM users WHERE nom = ? AND code = ?',
      [nom.toUpperCase(), code]
    );
    if (user) {
      res.json({ success: true, user });
    } else {
      res.status(401).json({ success: false, message: 'Identifiants invalides' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ API UTILISATEURS (CRUD avec token) ============
app.post('/api/users', verifyToken, async (req, res) => {
  try {
    const { nom, antenne, code } = req.body;
    const result = await db.run(
      'INSERT INTO users (nom, antenne, code) VALUES (?, ?, ?)',
      [nom.toUpperCase(), antenne, code]
    );
    res.json({ success: true, id: result.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users', verifyToken, async (req, res) => {
  try {
    const users = await db.all('SELECT id, nom, antenne, code, created_at FROM users');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', verifyToken, async (req, res) => {
  try {
    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ API CLIENTS (Lecture publique, CRUD avec token) ============
app.get('/api/clients', async (req, res) => {
  try {
    const clients = await db.all('SELECT * FROM clients ORDER BY nom');
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clients/:id', async (req, res) => {
  try {
    const client = await db.get('SELECT * FROM clients WHERE id = ?', [req.params.id]);
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clients', verifyToken, async (req, res) => {
  try {
    const { nom, forme, numero_rep, adresse } = req.body;
    const result = await db.run(
      'INSERT INTO clients (nom, forme, numero_rep, adresse) VALUES (?, ?, ?, ?)',
      [nom, forme, numero_rep, adresse]
    );
    res.json({ success: true, id: result.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/clients/:id', verifyToken, async (req, res) => {
  try {
    const { nom, forme, numero_rep, adresse } = req.body;
    await db.run(
      'UPDATE clients SET nom=?, forme=?, numero_rep=?, adresse=? WHERE id=?',
      [nom, forme, numero_rep, adresse, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/clients/:id', verifyToken, async (req, res) => {
  try {
    await db.run('DELETE FROM clients WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ API ADMIN CONFIG ============
app.get('/api/admin/config', async (req, res) => {
  try {
    const config = await db.get('SELECT * FROM admin_config LIMIT 1');
    res.json(config || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/config', verifyToken, async (req, res) => {
  try {
    const { entite_fiscale, banque, numero_compte, antenne } = req.body;
    await db.run('DELETE FROM admin_config');
    await db.run(
      'INSERT INTO admin_config (entite_fiscale, banque, numero_compte, antenne) VALUES (?, ?, ?, ?)',
      [entite_fiscale, banque, numero_compte, antenne]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ API NUMÉRO AUTO ============
app.get('/api/numero-next', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    let counter = await db.get('SELECT count FROM counters WHERE date = ?', [today]);

    if (!counter) {
      await db.run('INSERT INTO counters (date, count) VALUES (?, ?)', [today, 0]);
      counter = { count: 0 };
    }

    const newCount = counter.count + 1;
    await db.run('UPDATE counters SET count = ? WHERE date = ?', [newCount, today]);

    const numero = today.replace(/-/g, '') + String(newCount).padStart(3, '0');
    res.json({ numero });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ ADMIN PANEL (HTML STATIC) ============
app.use(express.static(path.join(__dirname, 'public')));

// ============ FICHIERS STATIQUES DE LA RACINE ============
app.use(express.static(path.join(__dirname, '..'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.html') || path.endsWith('.css') || path.endsWith('.js')) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// ============ DÉMARRER LE SERVEUR ============
app.listen(PORT, async () => {
  console.log(`\n✅ Serveur DGRKC lancé sur http://localhost:${PORT}\n`);
  console.log('📊 Admin Panel: http://localhost:3001/login-admin.html\n');
  console.log('🔐 Mot de passe admin: 123456\n');

  try {
    const exists = await db.get('SELECT COUNT(*) as count FROM users');
    if (exists.count === 0) {
      await db.run(
        'INSERT INTO users (nom, antenne, code) VALUES (?, ?, ?)',
        ['DEMO USER', 'SONGOLOLO', '1234']
      );
      console.log('📝 Utilisateur test créé: DEMO USER / Code: 1234\n');
    }
  } catch (err) {
    console.error('Erreur init:', err.message);
  }
});

module.exports = app;
