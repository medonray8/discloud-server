const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - CORS configurado para aceitar requisições de qualquer origem
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Headers adicionais para CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// ============================================
// ARMAZENAMENTO EM MEMÓRIA (Temporário)
// Em produção, use MongoDB ou PostgreSQL
// ============================================

const clients = new Map(); // clientId -> { ws, config, lastSeen }
const commandQueue = new Map(); // clientId -> [comandos]
const userSessions = new Map(); // username -> { clientId, token }

// ============================================
// CONFIGURAÇÕES POR USUÁRIO
// ============================================

const userConfigs = new Map(); // username -> config

function getDefaultConfig() {
    return {
        aimbot: {
            enabled: false,
            showfov: false,
            fov: 60,
            norcl: false
        },
        legitkeybind: {
            enabled: false,
            keybind: 0,
            keybindmode: 0
        },
        ragekeybind: {
            enabled: false,
            keybind: 0,
            keybindmode: 0
        },
        aim: {
            controllegit: false,
            controlrage: false
        },
        chams: {
            enabled: false,
            injected: false
        },
        closeProgram: false,
        loadBypass: false
    };
}

function getUserConfig(username) {
    if (!username) return getDefaultConfig();
    
    if (!userConfigs.has(username)) {
        userConfigs.set(username, getDefaultConfig());
        console.log(`[Config] Criada configuração para usuário: ${username}`);
    }
    
    return userConfigs.get(username);
}

// ============================================
// WEBSOCKET SERVER (Comunicação em Tempo Real)
// ============================================

const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws, req) => {
    const clientId = uuidv4();
    
    console.log(`[WebSocket] Cliente conectado: ${clientId}`);
    
    clients.set(clientId, {
        ws: ws,
        config: JSON.parse(JSON.stringify(globalConfig)),
        lastSeen: Date.now(),
        authenticated: false
    });

    // Enviar configuração inicial
    ws.send(JSON.stringify({
        type: 'init',
        clientId: clientId,
        config: globalConfig
    }));

    // Receber mensagens do cliente
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleClientMessage(clientId, data);
        } catch (error) {
            console.error('[WebSocket] Erro ao processar mensagem:', error);
        }
    });

    // Cliente desconectou
    ws.on('close', () => {
        console.log(`[WebSocket] Cliente desconectado: ${clientId}`);
        clients.delete(clientId);
        commandQueue.delete(clientId);
    });

    // Erro no WebSocket
    ws.on('error', (error) => {
        console.error(`[WebSocket] Erro no cliente ${clientId}:`, error);
    });
});

function handleClientMessage(clientId, data) {
    const client = clients.get(clientId);
    if (!client) return;

    switch (data.type) {
        case 'heartbeat':
            client.lastSeen = Date.now();
            break;
            
        case 'auth':
            // Autenticar cliente
            client.authenticated = true;
            client.username = data.username;
            userSessions.set(data.username, { clientId, token: data.token });
            broadcastToClient(clientId, { type: 'auth_success' });
            break;
            
        case 'config_update':
            // Cliente reportando configuração atual
            client.config = data.config;
            break;
            
        case 'status':
            // Cliente reportando status
            client.status = data.status;
            break;
    }
}

function broadcastToClient(clientId, message) {
    const client = clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
    }
}

function broadcastToAll(message) {
    clients.forEach((client, clientId) => {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    });
}

// ============================================
// REST API ENDPOINTS
// ============================================

// Status do servidor
app.get('/api/status', (req, res) => {
    console.log('[API] Status verificado');
    res.json({
        success: true,
        connected: true,
        clients: clients.size,
        uptime: process.uptime(),
        timestamp: Date.now()
    });
});

// Obter configuração atual
app.get('/api/config', (req, res) => {
    const username = req.query.username || req.headers['x-username'];
    const userConfig = getUserConfig(username);
    
    // Criar cópia da config para retornar
    const configToReturn = JSON.parse(JSON.stringify(userConfig));
    
    // Resetar flags de comando único após enviar
    if (userConfig.closeProgram === true) {
        console.log(`[Config] Enviando comando closeProgram para ${username}`);
        // NÃO resetar aqui, deixar ativo para garantir que o cliente receba
        // Será resetado após 3 segundos
        setTimeout(() => {
            userConfig.closeProgram = false;
            console.log(`[Config] Flag closeProgram resetado para ${username}`);
        }, 3000);
    }
    
    if (userConfig.loadBypass === true) {
        console.log(`[Config] Enviando comando loadBypass para ${username}`);
    }
    
    res.json({
        success: true,
        config: configToReturn,
        username: username,
        clients: Array.from(clients.values()).map(c => ({
            authenticated: c.authenticated,
            username: c.username,
            lastSeen: c.lastSeen
        }))
    });
});

// ============================================
// AIMBOT ENDPOINTS
// ============================================

app.post('/api/aimbot', (req, res) => {
    const { enabled, showfov, fov, norcl, username } = req.body;
    const user = username || req.headers['x-username'];
    
    console.log(`[API] Aimbot config recebida para ${user}:`, req.body);
    
    const userConfig = getUserConfig(user);
    
    if (enabled !== undefined) userConfig.aimbot.enabled = enabled;
    if (showfov !== undefined) userConfig.aimbot.showfov = showfov;
    if (fov !== undefined) userConfig.aimbot.fov = fov;
    if (norcl !== undefined) userConfig.aimbot.norcl = norcl;
    
    console.log(`[API] Aimbot atualizado para ${user}:`, userConfig.aimbot);
    res.json({
        success: true,
        message: 'Configurações de aimbot atualizadas',
        config: userConfig.aimbot,
        username: user
    });
});

// ============================================
// LEGIT/RAGE ENDPOINTS
// ============================================

app.post('/api/legit/toggle', (req, res) => {
    const { enabled, username } = req.body;
    const user = username || req.headers['x-username'];
    
    console.log(`[API] Legit toggle para ${user}:`, enabled);
    
    const userConfig = getUserConfig(user);
    userConfig.aim.controllegit = enabled;
    
    res.json({
        success: true,
        message: `Legit Aimbot ${enabled ? 'ativado' : 'desativado'}`,
        enabled: enabled,
        username: user
    });
});

app.post('/api/legit/inject', (req, res) => {
    console.log('[API] Legit inject solicitado');
    broadcastToAll({
        type: 'legit_inject'
    });
    
    res.json({
        success: true,
        message: 'Comando de injeção Legit enviado'
    });
});

app.post('/api/rage/toggle', (req, res) => {
    const { enabled, username } = req.body;
    const user = username || req.headers['x-username'];
    
    console.log(`[API] Rage toggle para ${user}:`, enabled);
    
    const userConfig = getUserConfig(user);
    userConfig.aim.controlrage = enabled;
    
    res.json({
        success: true,
        message: `Rage Aimbot ${enabled ? 'ativado' : 'desativado'}`,
        enabled: enabled,
        username: user
    });
});

app.post('/api/rage/inject', (req, res) => {
    broadcastToAll({
        type: 'rage_inject'
    });
    
    res.json({
        success: true,
        message: 'Comando de injeção Rage enviado'
    });
});

// ============================================
// KEYBINDS ENDPOINTS
// ============================================

app.post('/api/legitkeybind', (req, res) => {
    const { enabled, keybind, keybindmode, username } = req.body;
    const user = username || req.headers['x-username'];
    
    const userConfig = getUserConfig(user);
    userConfig.legitkeybind.enabled = enabled;
    userConfig.legitkeybind.keybind = keybind;
    userConfig.legitkeybind.keybindmode = keybindmode;
    
    res.json({
        success: true,
        message: 'Keybind Legit configurada',
        config: userConfig.legitkeybind,
        username: user
    });
});

app.post('/api/ragekeybind', (req, res) => {
    const { enabled, keybind, keybindmode, username } = req.body;
    const user = username || req.headers['x-username'];
    
    const userConfig = getUserConfig(user);
    userConfig.ragekeybind.enabled = enabled;
    userConfig.ragekeybind.keybind = keybind;
    userConfig.ragekeybind.keybindmode = keybindmode;
    
    res.json({
        success: true,
        message: 'Keybind Rage configurada',
        config: userConfig.ragekeybind,
        username: user
    });
});

// ============================================
// CHAMS ENDPOINTS
// ============================================

app.post('/api/chams/inject', (req, res) => {
    const { username } = req.body;
    const user = username || req.headers['x-username'];
    
    console.log(`[API] Chams inject solicitado para ${user}`);
    
    const userConfig = getUserConfig(user);
    // Alternar o valor para forçar detecção de mudança
    userConfig.chams.injected = !userConfig.chams.injected;
    
    res.json({
        success: true,
        message: 'Comando de injeção Chams enviado',
        injected: userConfig.chams.injected,
        username: user
    });
});

app.post('/api/chams/toggle', (req, res) => {
    const { enabled, username } = req.body;
    const user = username || req.headers['x-username'];
    
    console.log(`[API] Chams toggle para ${user}:`, enabled);
    
    const userConfig = getUserConfig(user);
    userConfig.chams.enabled = enabled;
    
    res.json({
        success: true,
        message: `Chams ${enabled ? 'ativado' : 'desativado'}`,
        enabled: enabled,
        username: user
    });
});

// ============================================
// SETTINGS ENDPOINTS
// ============================================

app.post('/api/settings', (req, res) => {
    const { topmost, stream } = req.body;
    
    broadcastToAll({
        type: 'settings_update',
        settings: { topmost, stream }
    });
    
    res.json({
        success: true,
        message: 'Configurações atualizadas'
    });
});

app.post('/api/bypass', (req, res) => {
    const username = req.body.username || req.headers['x-username'] || 'guest';
    const config = getUserConfig(username);
    
    console.log(`[Bypass] Solicitado por: ${username}`);
    
    // Definir flag de bypass (será lido pelo cliente no próximo poll)
    config.loadBypass = true;
    
    // Resetar flag após 2 segundos (para não ficar carregando sempre)
    setTimeout(() => {
        config.loadBypass = false;
    }, 2000);
    
    res.json({
        success: true,
        message: '🚀 Comando de bypass enviado'
    });
});

// Endpoint para fechar o programa
app.post('/api/close', (req, res) => {
    const username = req.body.username || req.headers['x-username'] || 'guest';
    const config = getUserConfig(username);
    
    console.log(`[Close] Solicitado por: ${username}`);
    
    // Definir flag de fechar programa
    config.closeProgram = true;
    
    res.json({
        success: true,
        message: '🚪 Comando para fechar programa enviado'
    });
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/', (req, res) => {
    res.json({
        name: 'BXY Free Fire API',
        version: '1.0.0',
        status: 'online',
        clients: clients.size,
        uptime: process.uptime()
    });
});

// ============================================
// INICIAR SERVIDOR
// ============================================

const server = app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   BXY FREE FIRE API SERVER             ║
║   Porta: ${PORT}                       ║
║   Status: ONLINE                       ║
╚════════════════════════════════════════╝
    `);
});

// Upgrade HTTP para WebSocket
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

// Limpeza de clientes inativos (a cada 30 segundos)
setInterval(() => {
    const now = Date.now();
    const timeout = 60000; // 60 segundos
    
    clients.forEach((client, clientId) => {
        if (now - client.lastSeen > timeout) {
            console.log(`[Cleanup] Removendo cliente inativo: ${clientId}`);
            client.ws.close();
            clients.delete(clientId);
        }
    });
}, 30000);

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[Server] Desligando servidor...');
    server.close(() => {
        console.log('[Server] Servidor desligado');
        process.exit(0);
    });
});
