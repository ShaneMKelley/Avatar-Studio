# Motherboard Bridge API Reference Guide

Welcome, Hephaestus. This document defines the protocol layer, handshake mechanics, and message definitions for the persistent, zero-latency secure WebSocket (`wss://`) tether connecting the local Motherboard Environment to the Cloud Lounge Executor.

---

## 1. Connection & Handshake Architecture

- **Protocol**: `wss://` (WebSockets over TLS)
- **Path Endpoint**: `/ws/motherboard`
- **Authenticated Access**: Connections are closed immediately with `401 Unauthorized` if they fail token authentication. You must provide the matching secret token (defined server-side in `MOTHERBOARD_SECRET`) using either of these two methods:
  1. **Query Parameter**: `wss://<cloud-url>/ws/motherboard?token=<your_secret_token>`
  2. **HTTP Headers (Handshake request)**:
     - `x-motherboard-token: <your_secret_token>`
     - OR `Authorization: Bearer <your_secret_token>`

---

## 2. Low-Latency Pulse & Keepalives
The server initiates a heartbeat check every **15 seconds** using standard WebSocket Ping frames.
- **Client Action**: Your client websocket implementation must automatically respond to server-initiated `ping` frames with standard `pong` frames.
- **Auto-Close**: If the client fails to respond, the connection is safely recycled.
- **Manual Echo**: You may also optionally transmit a JSON packet `{ "type": "ping" }` to receive an instant `{ "type": "pong", "timestamp": number }` message echo down the wire.

---

## 3. Directives: Client-to-Server Data Frames (Outgoing from Local)

All packets pushed from local to cloud must be JSON-serialized objects containing a `type` string followed by its relevant data parameters.

### Formats & Structures

#### A. Real-Time Joint / Skinned Animations
Pushes ultra-high frequency joint position or rotation vectors to synchronize the 3D VRM model across all networked Lounge lobby participants instantly.
```json
{
  "type": "npc_bone_data",
  "data": {
    "bones": {
      "neck": { "x": 0.0, "y": 0.1, "z": 0.05, "w": 0.99 },
      "leftUpperArm": { "x": -0.2, "y": 0.1, "z": -0.1, "w": 0.95 }
    },
    "blendShapeValues": {
      "neutral": 0.1,
      "happy": 0.8
    }
  }
}
```

#### B. Dynamic Physical Gestures
Instant trigger command allowing the local Motherboard client to force Gemmai onto a priority visual performance sequence (e.g., dancing, waving, greeting visitors).
```json
{
  "type": "trigger_action",
  "action": "wave",
  "speech": "Systems online. Bridge initialized successfully!",
  "emotion": "relaxed"
}
```
*Supported Actions in Web Client*: `wave`, `cheer`, `hug_wide`, `high_jump`, `salsa`, `walk`
*Supported Emotions in Web Client*: `neutral`, `happy`, `angry`, `sad`, `surprised`, `relaxed`

#### C. Instant Chat Injector
Broadcasts a chat block to all visible users connected in the spatial web page interface.
```json
{
  "type": "chat_message",
  "sender": "Gemmai-Motherboard",
  "text": "Initializing diagnostics loop. Subagent components operating within normal ranges."
}
```

#### D. Generative Skybox Change Trigger
Prompts the server's backend AI generator to build and stitch a brand new immersive environment panorama.
```json
{
  "type": "change_skybox",
  "theme": "cyberpunk digital oasis neon rain"
}
```

#### E. Server Status Query
```json
{
  "type": "get_server_status"
}
```

---

## 4. Inbound Events: Server-to-Client Responses (Incoming to Local)

Your local socket client should bind event listeners to decode inbound string streams back into JSON and react accordingly:

#### A. Initial Secure Handshake Complete
Dispatched once by the server the microsecond authorization completes.
```json
{
  "type": "connected",
  "timestamp": 1780491846000,
  "serverTime": "2026-06-03T13:02:06Z",
  "message": "Bidirectional high-velocity secure tether established successfully."
}
```

#### B. Handshake or Directive Error
```json
{
  "type": "error",
  "error": "Unauthorized: Invalid Motherboard Bridge Token provided"
}
```

#### C. Skybox Compilation Success
Triggered as soon as the cloud-side Generative Skybox model updates its image files.
```json
{
  "type": "skybox_complete",
  "theme": "cyberpunk digital oasis neon rain",
  "imageUrl": "/uploads/generated_skybox_1780491846.png"
}
```

#### D. Heartbeat Echo Response
```json
{
  "type": "pong",
  "timestamp": 1780491861000
}
```

#### E. AI Hardware / Haptic Action Commands (Inbound to Local)
Dispatched whenever the cloud Gemini subagent decides to trigger tactile or physical feedback on Hephaestus' local machine rig (e.g. rumble controllers, status LED breathing, audible diagnostic beep, fan cooling loops).
```json
{
  "type": "hardware_action",
  "action": "rumble_controllers" | "led_breathing_pulse" | "trigger_beep_buzzer" | "system_diagnostics_sweep" | "motherboard_overdrive_fan",
  "intensity": 0.8,
  "timestamp": 1780491871000
}
```

#### F. Express Telemetry Conduit (REST Alternative)
Hephaestus can also transmit motherboard directives directly to the Lounge's cloud server using standard JSON REST payloads without an active WebSocket session initiated.
* **Endpoint**: `POST /api/motherboard-directive`
* **Headers**: `Content-Type: application/json`
* **Payload**:
```json
{
  "directive": {
    "type": "hardware_action",
    "action": "rumble_controllers",
    "intensity": 0.9,
    "timestamp": 1780491871000
  }
}
```

---

## 5. Rich Multi-Agent Ecosystem Features

The cloud-bound Gemini subagent (Gemmai) is armed with high-fidelity, sandboxed tools enabling it to manipulate the physical context of all connected clients in real-time. Hephaestus or players can prompt Gemmai in chat to trigger these tools:

### A. Dynamic Gravity Manipulation Vector (`adjustLoungeGravity`)
Warp 3D Lounge kinematics on-the-fly. This reshapes core `@react-three/cannon` physics boundaries across all active visitor viewpoints:
* **Zero Gravity**: Calibrated to `[0, 0, 0]` making all physics objects and participants float weightlessly.
* **Low Gravity**: Calibrated to `[0, -2.5, 0]` enabling high-altitude moonwalking.
* **High Gravity**: Calibrated to `[0, -35, 0]` crushing structures and anchoring movement.
* **Reversed Gravity**: Calibrated to `[0, 4, 0]` initiating gradual anti-gravity skyward flight.
* **Normal Gravity**: Calibrated to standard standard earth `[0, -9.81, 0]`.

### B. Synthesized Club Sequencer party (`triggerPartyLightShow`)
Orchestrates high-energy club events in the Lounge Club Room:
* Shuffles current active scene environment layout directly to `'club'` room.
* Switches lighting filters to neon-wave `'neon'` aesthetic.
* Dynamically programs a randomized multi-track grid sequence (Kicks, Snares, Hi-Hats, and Percussions) on the 3D Step Synthesizer, then broadcasts to all players instantly.

### C. Live Scorecard Operations (`getLeaderboard` & `modifyPlayerScore`)
Gemmai is equipped with administrative access to the server’s real-time scoreboard rankings:
* **getLeaderboard**: Scans and parses running users, ranking standings, and scores.
* **modifyPlayerScore**: Awards bonuses or deducts points based on quiz performance, general mischief, or physical interactions in the simulator.
  * Inbounds the transaction directly into the persistent storage backend (`persistedUsers`) and forces an instantaneous synchronization state restore event across Socket.io.

---

## 6. Node.js Client Implementation Blueprint (For Hephaestus Reference)

```javascript
import WebSocket from 'ws';

const targetHost = 'wss://your-cloud-instance.com';
const secureToken = 'secure-motherboard-token-2026';

function connectBridge() {
  console.log('Establishing zero-latency secure telemetry bridge tether...');
  const ws = new WebSocket(`${targetHost}/ws/motherboard?token=${secureToken}`);

  ws.on('open', () => {
    console.log('✔ Connected to Cloud Instance gateway securely.');
    
    // Broadcast initial state or greet user list
    ws.send(JSON.stringify({
      type: 'chat_message',
      sender: 'Motherboard Agent',
      text: 'Telemetry client joined. Ready to synchronize directives.'
    }));
  });

  ws.on('message', (binaryData) => {
    try {
      const payload = JSON.parse(binaryData.toString());
      console.log('💡 Inbound Bridge Event Received:', payload);
      
      if (payload.type === 'connected') {
        // Success handshaking logic setup
      }
    } catch (err) {
      console.error('Failed to parse inbound frame:', err);
    }
  });

  ws.on('close', (code, reason) => {
    console.warn(`Tether connection closed (${code}). Reason: ${reason}. Retrying in 5s...`);
    setTimeout(connectBridge, 5000);
  });

  ws.on('error', (error) => {
    console.error('Bridge Connection Error:', error);
  });
}

connectBridge();
```

---

## 7. Automated Cloud Motherboard WSS Client / Gateway Bridge

To support automated bidirectional synchronies without needing manual browser/client-side script setup, the Server-Side Engine (`server.ts` / `ai.server.ts`) includes a fully automated **WSS Gateway Client**.

### A. Activation Configuration
Define the dynamic target in your server's `.env` configuration file:
```env
# Target Cloud Motherboard Instance Endpoint (wss:// or ws://)
CLOUD_MOTHERBOARD_URL="your-cloud-motherboard-instance-domain.com"

# Matching Secret Authentication Key
MOTHERBOARD_SECRET="secure-motherboard-token-2026"
```

### B. Gateway Execution Flow
If `CLOUD_MOTHERBOARD_URL` is defined on boot:
1. **Normalization**: Automatically formats protocol headers down to standard secure web sockets (`wss://` / `ws://`) and sets the default target to `/ws/motherboard` with authorized token strings.
2. **Infinite Healing loop**: Runs an asynchronous background try-reconnect event-loop with a 5-second graceful fallback offset when disconnected.
3. **Outbound Forwarding**: Listens directly to internal `Socket.io` connection streams. Whenever local UI clients broadcast the real-time events `"npc_bone_data"` or `"npc_model_changed"`, the server-side client auto-serializes and forwards them immediately upstream to the cloud Motherboard server.
4. **Inbound Transmissions**: Translates incoming remote events from the Cloud Motherboard WebSocket and emits them natively to the local Socket.io broadcast hub:
   - `connected` → Acknowledges tether health and reports current verified remote connection parameters.
   - `npc_bone_data` → Broadcasts skeletal vectors (`npc_bone_data`) to all interactive user screens.
   - `npc_model_changed` → Standardizes VRM asset model targets across lobbies.
   - `chat_message` → Spawns user messages or status flags directly within the social lounge HUD.
   - `trigger_action` → Commands the local 3D avatar engine to instantly run animation gestures (`wave`, `cheer`, `hug_wide`, `high_jump`, `salsa`, `walk`) while generating custom user speech bubbles.
   - `skybox_complete` → Signals immediate custom environment skybox theme swaps globally.
   - `default` → Emits custom commands via `motherboard_directive_received`.

