# Guide Complet : Hébergement et Communication Serveur-Application Exécutable

## Table des Matières
1. [Architecture du Système](#architecture)
2. [Configuration du Serveur](#configuration)
3. [Communication Client-Serveur](#communication)
4. [Déploiement](#déploiement)
5. [Sécurité](#sécurité)
6. [Dépannage](#dépannage)

---

## Architecture du Système {#architecture}

### Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  APPLICATION EXÉCUTABLE (Electron/PyInstaller)                 │
│  ├─ Interface Utilisateur                                      │
│  ├─ Logique Métier                                             │
│  └─ Client HTTP REST                                           │
│                                                                 │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ HTTP/HTTPS
                 │ REST API Calls
                 │ JSON Data
                 │
┌────────────────┴────────────────────────────────────────────────┐
│                                                                 │
│  SERVEUR EXPRESS (Node.js)                                     │
│  ├─ API REST Endpoints (/api/*)                                │
│  ├─ Database (SQLite3)                                         │
│  ├─ Authentification JWT                                       │
│  └─ Fichiers Statiques                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Technologie Stack Actuelle

**Backend:**
- Node.js + Express.js
- SQLite3 (Base de données locale)
- JWT (JSON Web Tokens) pour authentification
- CORS pour gestion cross-origin
- Port: 3001

**Frontend/Client:**
- HTML5, CSS3, JavaScript vanilla
- Lucide Icons
- html2pdf.js pour génération PDF
- Appelera le serveur via HTTP

---

## Configuration du Serveur {#configuration}

### 1. Configuration Locale (Développement)

#### A. Démarrer le Serveur

```bash
cd "g:\PROJET DEV\DGRKC\server"
npm install        # Installer les dépendances si besoin
npm start          # Démarrer le serveur
```

**Sortie attendue :**
```
✅ Serveur DGRKC lancé sur http://localhost:3001

📊 Admin Panel: http://localhost:3001/login-admin.html
🔐 Mot de passe admin: 123456
📝 Utilisateur test créé: DEMO USER / Code: 1234
```

#### B. Vérifier la Connexion

Ouvre dans le navigateur:
```
http://localhost:3001/api/admin/config
```

Tu devrais voir un JSON vide ou avec la configuration.

### 2. Configuration pour Application Exécutable

#### A. Permettre les Connexions à Distance

**Modification du serveur** (`server/server.js`):

Avant (localhost uniquement):
```javascript
app.listen(PORT, async () => {
    console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
});
```

Après (accepter toutes les connexions):
```javascript
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`✅ Serveur DGRKC lancé sur http://0.0.0.0:${PORT}`);
    console.log(`📌 Accessible à: http://localhost:${PORT} (local)`);
    console.log(`📌 Accessible à: http://<VOTRE_IP>:${PORT} (réseau)`);
});
```

Trouve ton adresse IP:
```bash
# Windows PowerShell
ipconfig

# Cherche "IPv4 Address" sous ta connexion réseau
# Ex: 192.168.1.100
```

#### B. Tester l'Accès Distant

Depuis une autre machine sur le même réseau:
```
http://192.168.1.100:3001/index.html
```

---

## Communication Client-Serveur {#communication}

### 1. Architecture REST API

#### Endpoints Disponibles

| Méthode | Endpoint | Authentification | Description |
|---------|----------|------------------|-------------|
| POST | `/api/admin/login` | Non | Authentification admin |
| POST | `/api/users/login` | Non | Login utilisateur |
| GET | `/api/users` | JWT Token | Lister les utilisateurs |
| POST | `/api/users` | JWT Token | Créer utilisateur |
| DELETE | `/api/users/:id` | JWT Token | Supprimer utilisateur |
| GET | `/api/clients` | Non | Lister les clients |
| POST | `/api/clients` | JWT Token | Créer client |
| GET | `/api/admin/config` | Non | Obtenir configuration |
| POST | `/api/admin/config` | JWT Token | Sauvegarder config |
| GET | `/api/numero-next` | Non | Générer prochain numéro |

### 2. Exemple : Login Utilisateur

**Requête HTTP:**
```javascript
fetch('http://192.168.1.100:3001/api/users/login', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        nom: 'DEMO USER',
        code: '1234'
    })
})
.then(res => res.json())
.then(data => {
    if (data.success) {
        console.log('Connecté:', data.user);
        localStorage.setItem('user_token', data.user.nom);
    }
})
.catch(err => console.error('Erreur:', err));
```

**Réponse (Succès):**
```json
{
    "success": true,
    "user": {
        "id": 1,
        "nom": "DEMO USER",
        "antenne": "SONGOLOLO",
        "code": "1234",
        "created_at": "2026-06-07T12:34:56.000Z"
    }
}
```

**Réponse (Échec):**
```json
{
    "success": false,
    "message": "Identifiants invalides"
}
```

### 3. Exemple : Récupérer les Clients (avec Authentification)

**Requête:**
```javascript
const token = localStorage.getItem('admin_token');

fetch('http://192.168.1.100:3001/api/clients', {
    method: 'GET',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    }
})
.then(res => res.json())
.then(clients => console.log('Clients:', clients));
```

---

## Créer une Application Exécutable {#application}

### Option 1 : Utiliser Electron (Recommandé)

Electron permet de créer une application exécutable desktop qui inclut Chromium.

#### A. Installation

```bash
cd "g:\PROJET DEV\DGRKC"
npm install electron --save-dev
npm install electron-builder --save-dev
```

#### B. Structure du Projet Electron

```
DGRKC/
├── main.js                 # Processus principal Electron
├── preload.js              # Préchargement sécurisé
├── package.json            # Configuration build
├── index.html              # Page d'accueil
├── script.js               # Logique client
└── server/                 # Serveur Node.js
    ├── server.js
    ├── database.js
    └── public/
```

#### C. Fichier main.js pour Electron

```javascript
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

app.on('ready', () => {
    // Démarrer le serveur
    const serverPath = path.join(__dirname, 'server', 'server.js');
    serverProcess = spawn('node', [serverPath], {
        stdio: 'inherit'
    });

    // Créer la fenêtre
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Attendre que le serveur soit prêt (2 secondes)
    setTimeout(() => {
        mainWindow.loadURL('http://localhost:3001/index.html');
    }, 2000);

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (serverProcess) {
            serverProcess.kill();
        }
    });
});

app.on('window-all-closed', () => {
    app.quit();
});
```

#### D. Configuration package.json

```json
{
    "name": "dgrkc-ordonnancement-fiscal",
    "version": "1.0.0",
    "description": "Application DGRKC d'Ordonnancement Fiscal",
    "main": "main.js",
    "scripts": {
        "start": "electron .",
        "build": "electron-builder"
    },
    "build": {
        "appId": "com.dgrkc.fiscal",
        "productName": "DGRKC Ordonnancement Fiscal",
        "files": [
            "main.js",
            "preload.js",
            "index.html",
            "script.js",
            "style.css",
            "server/**/*",
            "node_modules/**/*"
        ],
        "win": {
            "target": [
                "nsis",
                "portable"
            ]
        }
    }
}
```

#### E. Construire l'Exécutable

```bash
npm run build
```

L'exécutable sera dans `dist/`.

---

### Option 2 : Utiliser PyInstaller (Python)

Si tu préfères Python pour créer l'exécutable :

```python
import subprocess
import requests
import tkinter as tk
from tkinter import messagebox

class DGRKCApp:
    def __init__(self):
        self.server_process = None
        self.server_url = "http://localhost:3001"
        
    def start_server(self):
        """Démarrer le serveur Node.js"""
        self.server_process = subprocess.Popen(
            ["node", "server/server.js"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
    def stop_server(self):
        """Arrêter le serveur"""
        if self.server_process:
            self.server_process.terminate()
            
    def login(self, nom, code):
        """Authentifier un utilisateur"""
        try:
            response = requests.post(
                f"{self.server_url}/api/users/login",
                json={"nom": nom, "code": code}
            )
            return response.json()
        except Exception as e:
            messagebox.showerror("Erreur", f"Impossible de se connecter: {str(e)}")
            return None

app = DGRKCApp()
app.start_server()
```

---

## Déploiement {#déploiement}

### 1. Déploiement Local (Même Machine)

```
Machine Windows
├─ Serveur Node.js (port 3001)
└─ Application Electron
   └─ Accède à http://localhost:3001
```

**Installation:**
1. Installer Node.js
2. Cloner le projet
3. `npm install` dans `/server`
4. Lancer l'exécutable Electron

### 2. Déploiement en Réseau Local

```
Serveur (Windows/Linux)
│
├─ Port 3001 ouvert
├─ Adresse IP: 192.168.1.100
└─ Clients sur le réseau accèdent via: http://192.168.1.100:3001
```

**Configuration Pare-feu:**

Windows:
```powershell
# Autoriser le port 3001
netsh advfirewall firewall add rule name="Node.js Port 3001" `
    dir=in action=allow protocol=tcp localport=3001
```

### 3. Déploiement en Production (Internet)

#### A. Utiliser un Service Cloud

**Optionnel Gratuit:**
- **Render** (render.com)
- **Heroku** (heroku.com) - avec plan payant
- **Railway** (railway.app)

#### B. Configuration pour Production

```javascript
// Utiliser HTTPS en production
const https = require('https');
const fs = require('fs');

const options = {
    key: fs.readFileSync('path/to/private-key.pem'),
    cert: fs.readFileSync('path/to/certificate.pem')
};

https.createServer(options, app).listen(443);
```

#### C. Variables d'Environnement

Créer un fichier `.env`:
```
NODE_ENV=production
API_URL=https://votredomaine.com
PORT=443
CORS_ORIGIN=https://votredomaine.com
```

---

## Sécurité {#sécurité}

### 1. Authentification JWT

Le serveur utilise JWT. L'application exécutable doit:

```javascript
// Sauvegarder le token après login
localStorage.setItem('admin_token', response.token);

// Utiliser le token dans les requêtes protégées
fetch('http://localhost:3001/api/users', {
    headers: {
        'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
    }
});
```

### 2. Changement du Mot de Passe Admin

Dans `server/server.js`, ligne 37:
```javascript
if (password !== '123456') {  // ⚠️ CHANGER CETTE VALEUR
```

**En production**, utiliser une variable d'environnement:
```javascript
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';
if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false });
}
```

### 3. HTTPS/SSL

Pour une application en production, configurer SSL:

```bash
# Générer un certificat auto-signé (développement)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365
```

### 4. Chiffrer les Données Sensibles

```javascript
const crypto = require('crypto');

function chiffrer(texte, cle) {
    const cipher = crypto.createCipher('aes192', cle);
    let chiffre = cipher.update(texte, 'utf8', 'hex');
    chiffre += cipher.final('hex');
    return chiffre;
}
```

---

## Configuration d'Accès pour Application Exécutable {#config-app}

### Dans l'Application Exécutable

Remplacer toutes les URLs:

```javascript
// ❌ Avant (localhost)
const API_URL = 'http://localhost:3001';

// ✅ Après (configurable)
const API_URL = window.API_CONFIG?.url || 'http://localhost:3001';

// Ou utiliser une variable d'environnement
const API_URL = process.env.API_URL || 'http://localhost:3001';
```

### Fichier de Configuration (config.json)

```json
{
    "apiUrl": "http://192.168.1.100:3001",
    "appName": "DGRKC Ordonnancement Fiscal",
    "version": "1.0.0",
    "environment": "production"
}
```

Charger dans l'app:
```javascript
fetch('config.json')
    .then(res => res.json())
    .then(config => {
        window.API_CONFIG = config;
    });
```

---

## Dépannage {#dépannage}

### Problème 1: "Impossible de se connecter au serveur"

**Solutions:**
```bash
# 1. Vérifier que le serveur tourne
netstat -ano | findstr :3001

# 2. Vérifier que le port est accessible
curl http://localhost:3001/api/admin/config

# 3. Redémarrer le serveur
taskkill /PID <PID> /F
npm start
```

### Problème 2: "CORS Error"

**Solution dans server.js:**
```javascript
const cors = require('cors');

app.use(cors({
    origin: ['http://localhost:3001', 'http://192.168.1.100:3001'],
    credentials: true
}));
```

### Problème 3: "Port 3001 déjà utilisé"

```bash
# Trouver le processus
netstat -ano | findstr :3001

# Tuer le processus
taskkill /PID <PID> /F

# Ou utiliser un autre port
PORT=3002 npm start
```

### Problème 4: "Base de données verrouillée"

```bash
# Supprimer le fichier de base de données
rm server/dgrkc.db

# Redémarrer - il sera recréé
npm start
```

---

## Résumé des Étapes pour Déployer

### 1. Développement Local
```bash
cd server && npm install && npm start
# Accéder à http://localhost:3001
```

### 2. Créer l'Exécutable (Electron)
```bash
npm install electron electron-builder
npm run build
# Exécutable dans dist/
```

### 3. Déploiement en Réseau
- Modifier `server.js` pour écouter sur `0.0.0.0`
- Configurer le pare-feu (port 3001)
- Clients utilisent `http://<IP_SERVEUR>:3001`

### 4. Production
- Utiliser HTTPS/SSL
- Changer le mot de passe admin
- Utiliser des variables d'environnement
- Configurer un reverse proxy (Nginx)

---

## Fichiers Importants

| Fichier | Rôle |
|---------|------|
| `server/server.js` | Configuration API Express |
| `server/database.js` | Gestion SQLite3 |
| `main.js` | Point d'entrée Electron |
| `script.js` | Logique client |
| `index.html` | Interface utilisateur |
| `.env` | Variables d'environnement |

---

## Contact & Support

Pour questions:
1. Vérifier les logs du serveur
2. Utiliser DevTools (F12) dans l'app
3. Vérifier la connexion réseau
4. Consulter les endpoints API

**Fin du guide.**
