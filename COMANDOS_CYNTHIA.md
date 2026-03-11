# 🤖 COMANDOS DE CYNTHIA - My Wedding Palace

## 📱 COMANDOS DESDE TU CELULAR ADMIN (+51992371285)
*Escríbele al número de la empresa desde tu celular personal*

| Comando | Qué hace |
|---------|----------|
| `/apagarbot` | Apaga Cynthia para TODOS los chats |
| `/prenderbot` | Prende Cynthia para TODOS (sin borrar memorias) |
| `/reset +13235551234` | Borra memoria de ese cliente Y reactiva su chat |
| `/activar +13235551234` | Reactiva ese chat SIN borrar su memoria |

---

## 📱 COMANDOS DESDE EL CELULAR DE LA EMPRESA
*Escríbele a un cliente desde el WhatsApp de la empresa*

| Comando | Qué hace |
|---------|----------|
| `/apagarbot` | Apaga Cynthia globalmente |
| `/prenderbot` | Prende Cynthia globalmente |
| `/activar` | Reactiva Cynthia en ESE chat específico |
| `/reset` | Borra memoria y reactiva ESE chat |
| *Cualquier mensaje normal* | Pausa automáticamente a Cynthia en ese chat |

---

## 🚨 ALERTAS AUTOMÁTICAS
Cuando un cliente quiere agendar, pagar o hablar con un humano,
Cynthia envía automáticamente una alerta al grupo **"Alertas MWP"** con:
- Número del cliente (link clickeable wa.me/...)
- Motivo de la derivación

---

## 🔧 PARA HACER CAMBIOS AL BOT

### Cambiar precios o información del servicio:
1. Abre VS Code en tu Mac
2. Edita el archivo `src/knowledge.txt`
3. Guarda y ejecuta:
```bash
git add -A && git commit -m "actualizar info" && git push
```
4. Dockploy actualiza automáticamente en ~1 minuto ✅

### Cambiar reglas de comportamiento de Cynthia:
1. Edita `src/agent/loop.ts`
2. Guarda y sube con el mismo comando de arriba

### Agregar un nuevo número admin:
1. Abre `src/index.ts`
2. Busca `ADMIN_NUMBERS`
3. Agrega el número: `["51992371285", "NUEVO_NUMERO"]`
4. Sube los cambios

---

## 🌐 URLS IMPORTANTES

| Servicio | URL |
|---------|-----|
| Bot Cynthia (VPS) | https://mwp.botlylatam.cloud |
| Webhook Evolution | https://mwp.botlylatam.cloud/webhook |
| Evolution API Panel | https://evolutionapi.botlylatam.cloud |
| Dockploy Panel | http://72.61.131.247:3000 |

---

## 📦 PAQUETES OFICIALES

| Paquete | Nombre Completo |
|---------|----------------|
| Básico | Boda Sencilla |
| Premium | Boda en Capilla Elegante |
| A domicilio | Boda a Domicilio |

---

## ⚡ COMANDOS GIT (cuando hagas cambios)
```bash
# Subir cambios al VPS
git add -A
git commit -m "descripción del cambio"
git push
```
*Dockploy detecta el push y redespliega automáticamente.*

---

## 🆘 SI EL BOT DEJA DE FUNCIONAR
1. Entra a Dockploy
2. Busca la app **OpenGravity**
3. Dale **"Redeploy"** o **"Restart"**
4. Revisa los **Logs** para ver el error
