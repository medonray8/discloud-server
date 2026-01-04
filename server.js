const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - CORS configurado para aceitar requisiÃ§Ãµes de qualquer origem
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
// ARMAZENAMENTO EM MEMÃ“RIA (TemporÃ¡rio)
// Em produÃ§Ã£o, use MongoDB ou PostgreSQL
// ============================================

const clients = new Map(); // clientId -> { ws, config, lastSeen }
const commandQueue = new Map(); // clientId -> [comandos]
const userSessions = new Map(); // username -> { clientId, token }

// ============================================
// CONFIGURAÃ‡Ã•ES GLOBAIS
// ============================================

const globalConfig = {
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
    }
};

// ============================================
// WEBSOCKET SERVER (ComunicaÃ§Ã£o em Tempo Real)
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

    // Enviar configuraÃ§Ã£o inicial
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
            // Cliente reportando configuraÃ§Ã£o atual
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

// Obter configuraÃ§Ã£o atual
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        config: globalConfig,
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
    const { enabled, showfov, fov, norcl } = req.body;
    console.log('[API] Aimbot config recebida:', req.body);
    
    if (enabled !== undefined) globalConfig.aimbot.enabled = enabled;
    if (showfov !== undefined) globalConfig.aimbot.showfov = showfov;
    if (fov !== undefined) globalConfig.aimbot.fov = fov;
    if (norcl !== undefined) globalConfig.aimbot.norcl = norcl;
    
    broadcastToAll({
        type: 'config_update',
        category: 'aimbot',
        config: globalConfig.aimbot
    });
    
    console.log('[API] Aimbot atualizado:', globalConfig.aimbot);
    res.json({
        success: true,
        message: 'ConfiguraÃ§Ãµes de aimbot atualizadas',
        config: globalConfig.aimbot
    });
});

// ============================================
// LEGIT/RAGE ENDPOINTS
// ============================================

app.post('/api/legit/toggle', (req, res) => {
    const { enabled } = req.body;
    console.log('[API] Legit toggle:', enabled);
    globalConfig.aim.controllegit = enabled;
    
    broadcastToAll({
        type: 'legit_toggle',
        enabled: enabled
    });
    
    res.json({
        success: true,
        message: `Legit Aimbot ${enabled ? 'ativado' : 'desativado'}`,
        enabled: enabled
    });
});

app.post('/api/legit/inject', (req, res) => {
    console.log('[API] Legit inject solicitado');
    broadcastToAll({
        type: 'legit_inject'
    });
    
    res.json({
        success: true,
        message: 'Comando de injeÃ§Ã£o Legit enviado'
    });
});

app.post('/api/rage/toggle', (req, res) => {
    const { enabled } = req.body;
    console.log('[API] Rage toggle:', enabled);
    globalConfig.aim.controlrage = enabled;
    
    broadcastToAll({
        type: 'rage_toggle',
        enabled: enabled
    });
    
    res.json({
        success: true,
        message: `Rage Aimbot ${enabled ? 'ativado' : 'desativado'}`,
        enabled: enabled
    });
});

app.post('/api/rage/inject', (req, res) => {
    broadcastToAll({
        type: 'rage_inject'
    });
    
    res.json({
        success: true,
        message: 'Comando de injeÃ§Ã£o Rage enviado'
    });
});

// ============================================
// KEYBINDS ENDPOINTS
// ============================================

app.post('/api/legitkeybind', (req, res) => {
    const { enabled, keybind, keybindmode } = req.body;
    
    globalConfig.legitkeybind.enabled = enabled;
    globalConfig.legitkeybind.keybind = keybind;
    globalConfig.legitkeybind.keybindmode = keybindmode;
    
    broadcastToAll({
        type: 'config_update',
        category: 'legitkeybind',
        config: globalConfig.legitkeybind
    });
    
    res.json({
        success: true,
        message: 'Keybind Legit configurada',
        config: globalConfig.legitkeybind
    });
});

app.post('/api/ragekeybind', (req, res) => {
    const { enabled, keybind, keybindmode } = req.body;
    
    globalConfig.ragekeybind.enabled = enabled;
    globalConfig.ragekeybind.keybind = keybind;
    globalConfig.ragekeybind.keybindmode = keybindmode;
    
    broadcastToAll({
        type: 'config_update',
        category: 'ragekeybind',
        config: globalConfig.ragekeybind
    });
    
    res.json({
        success: true,
        message: 'Keybind Rage configurada',
        config: globalConfig.ragekeybind
    });
});

// ============================================
// CHAMS ENDPOINTS
// ============================================

app.post('/api/chams/inject', (req, res) => {
    console.log('[API] Chams inject solicitado');
    globalConfig.chams.injected = true;
    
    broadcastToAll({
        type: 'chams_inject'
    });
    
    res.json({
        success: true,
        message: 'Comando de injeÃ§Ã£o Chams enviado'
    });
});

app.post('/api/chams/toggle', (req, res) => {
    const { enabled } = req.body;
    console.log('[API] Chams toggle:', enabled);
    globalConfig.chams.enabled = enabled;
    
    broadcastToAll({
        type: 'chams_toggle',
        enabled: enabled
    });
    
    res.json({
        success: true,
        message: `Chams ${enabled ? 'ativado' : 'desativado'}`,
        enabled: enabled
    });
});
        message: `Chams ${enabled ? 'ativado' : 'desativado'}`,
        enabled: enabled
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
        message: 'ConfiguraÃ§Ãµes atualizadas'
    });
});

app.post('/api/bypass', (req, res) => {
    broadcastToAll({
        type: 'bypass_load'
    });
    
    res.json({
        success: true,
        message: 'Comando de bypass enviado'
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
â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
â•‘   BXY FREE FIRE API SERVER             â•‘
â•‘   Porta: ${PORT}                       â•‘
â•‘   Status: ONLINE                       â•‘
â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
