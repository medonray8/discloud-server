# 🚀 Deploy BXY Free Fire na Discloud

## 📋 Pré-requisitos

1. **Conta Discloud:** https://discloud.app/
2. **Node.js instalado** (para testar localmente)

---

## ⚡ Deploy Rápido (5 minutos)

### **1. Preparar Arquivos**

Certifique-se que você tem:
```
discloud-server/
├── server.js
├── package.json
├── .discloudconfig
└── README_DISCLOUD.md
```

### **2. Compactar em ZIP**

**Windows:**
1. Selecione TODOS os arquivos dentro de `discloud-server/`
2. Clique com botão direito → "Enviar para" → "Pasta compactada"
3. Renomeie para: `bxy-server.zip`

**PowerShell:**
```powershell
cd "C:\Users\gusta9\Desktop\BXY Products\BXY Free Fire\discloud-server"
Compress-Archive -Path * -DestinationPath ..\bxy-server.zip
```

### **3. Upload na Discloud**

1. Acesse: https://discloud.app/dashboard
2. Clique em **"Upload"**
3. Selecione `bxy-server.zip`
4. Aguarde o deploy (1-2 minutos)
5. Copie a URL: `https://seu-app.discloud.app`

### **4. Testar**

Abra no navegador:
```
https://seu-app.discloud.app/api/status
```

Deve retornar:
```json
{
  "success": true,
  "connected": true,
  "clients": 0,
  "uptime": 123
}
```

---

## 🔧 Configurar Cliente (Cheat)

Agora que a API está na Discloud, você precisa atualizar o cheat para conectar com ela.

### **Criar Cliente WebSocket (C++)**

Vou criar o arquivo `DiscloudClient.hpp` na pasta do cheat.

---

## 🌐 URLs da API

Após deploy, anote sua URL:
```
https://seu-app.discloud.app
```

Substitua no `index.html` (linha 794):
```javascript
remoteAPI: 'https://seu-app.discloud.app'
```

---

## 📊 Endpoints Disponíveis

### **Status**
```
GET /api/status
Retorna: { success, connected, clients, uptime }
```

### **Aimbot**
```
POST /api/aimbot
Body: { enabled, showfov, fov, norcl }
```

### **Legit/Rage**
```
POST /api/legit/toggle
Body: { enabled }

POST /api/rage/toggle
Body: { enabled }
```

### **Keybinds**
```
POST /api/legitkeybind
Body: { enabled, keybind, keybindmode }

POST /api/ragekeybind
Body: { enabled, keybind, keybindmode }
```

### **Chams**
```
POST /api/chams/inject
POST /api/chams/toggle
Body: { enabled }
```

---

## 🔄 Como Funciona

### **Fluxo de Comunicação:**

```
[Painel Web] → [API Discloud] → [WebSocket] → [Cliente no PC] → [Cheat]
```

1. **Usuário acessa painel:** `https://seu-site.com`
2. **Clica em "Ativar Aimbot"**
3. **Painel envia para API:** `POST /api/legit/toggle`
4. **API envia via WebSocket:** para todos os clientes conectados
5. **Cliente no PC recebe:** comando via WebSocket
6. **Cliente executa:** ativa aimbot no jogo

---

## 🎮 Instalar Cliente (PC do Usuário)

### **Cada usuário precisa:**

1. **Baixar:** `BXY.exe` (seu cheat)
2. **Executar:** cheat se conecta automaticamente com Discloud
3. **Autenticar:** login via painel web
4. **Usar:** controla via navegador

### **Fluxo de Instalação:**

```
Usuário baixa BXY.exe
    ↓
Executa BXY.exe
    ↓
Cheat conecta com: https://seu-app.discloud.app
    ↓
WebSocket estabelecido
    ↓
Usuário acessa painel web
    ↓
Controla o cheat remotamente
```

---

## 🔒 Segurança

### **Implementar:**

1. **Autenticação por Token**
   ```javascript
   const token = generateToken(username, hwid);
   ws.send({ type: 'auth', token });
   ```

2. **Rate Limiting**
   - Limitar requisições por IP
   - Evitar spam de comandos

3. **HWID Binding**
   - Cada licença = 1 HWID
   - Validar antes de aceitar comandos

---

## 📈 Monitoramento

### **Logs na Discloud:**

Acesse: Dashboard → Seu App → Logs

Você verá:
```
[WebSocket] Cliente conectado: abc-123
[WebSocket] Cliente desconectado: abc-123
[API] Legit toggle: true
```

### **Clientes Ativos:**

```
GET /api/config
```

Retorna lista de clientes conectados.

---

## 💰 Custos Discloud

**Plano Gratuito:**
- 512MB RAM
- 1 CPU
- Suficiente para ~100 usuários simultâneos

**Plano Pago ($5/mês):**
- 1GB RAM
- 2 CPUs
- ~500 usuários simultâneos

---

## 🚨 Troubleshooting

### **Erro: "Cannot connect to server"**
✅ Verificar se deploy foi bem-sucedido
✅ Testar URL no navegador
✅ Verificar logs na Discloud

### **Erro: "WebSocket closed"**
✅ Cliente precisa reautenticar
✅ Verificar firewall
✅ Aumentar timeout

### **Erro: "Too many requests"**
✅ Implementar rate limiting
✅ Aumentar RAM na Discloud

---

## 🎯 Próximos Passos

1. ✅ **Deploy na Discloud** (este arquivo)
2. ⏳ **Criar Cliente C++** (DiscloudClient.hpp)
3. ⏳ **Integrar no Cheat** (main.cpp)
4. ⏳ **Testar Comunicação** (WebSocket)
5. ⏳ **Deploy Produção** (domínio .com.br)

---

## 📞 Suporte

Em caso de dúvidas:
- Discord da Discloud
- Documentação: https://docs.discloud.app/

**Servidor está pronto para deploy! 🚀**
