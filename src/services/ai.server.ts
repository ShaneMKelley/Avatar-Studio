import { GoogleGenAI, Type, Modality, FunctionDeclaration } from "@google/genai";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import { Server as SocketIoServer } from "socket.io";

let aiInstance: GoogleGenAI | null = null;
let currentKeyUsed: string | null = null;

// Dynamic fetch helper for GemmaOS Swarm API Key Synchronization Fallbacks
export async function getGenAIClient(): Promise<GoogleGenAI> {
  const activeKey = process.env.GEMINI_API_KEY || "";
  
  // Enforce usage of environment variables; fail early with a clear message if no key is found
  if (!activeKey || activeKey === "DUMMY_KEY_FALLBACK" || activeKey === "MY_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY environment variable is required but is missing or set to a placeholder. Please configure it in your environment or .env file.");
  }

  if (!aiInstance || currentKeyUsed !== activeKey) {
    aiInstance = new GoogleGenAI({
      apiKey: activeKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    currentKeyUsed = activeKey;
  }
  return aiInstance;
}

const changeSkyboxFunc: FunctionDeclaration = {
  name: "changeSkybox",
  description: "Changes the virtual reality skybox/environment to a new theme based on the user's request.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      theme: {
        type: Type.STRING,
        description: "A highly detailed visual description of the new environment (e.g., 'a bright sunny day on a tropical beach', 'a cyberpunk city at night')."
      }
    },
    required: ["theme"]
  }
};

const changeModelFunc: FunctionDeclaration = {
  name: "changeModel",
  description: "Changes Gemmai's custom 3D model/outfit/avatar style to one of the available options.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      modelName: {
        type: Type.STRING,
        description: "The name of the model/outfit style to change to. Must be exactly one of: 'Awakened', 'Casual', 'Cat', 'Tactical', 'Tatted', or 'next' to cycle through them.",
      },
      speech: {
        type: Type.STRING,
        description: "What Gemmai should say to the user to announce her new outfit/model change.",
      }
    },
    required: ["modelName", "speech"]
  }
};

const performActionFunc: FunctionDeclaration = {
  name: "performAction",
  description: "Commands the NPC (Gemmai) to perform a physical action, gesture, or spawn an object in the world.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      actionType: {
        type: Type.STRING,
        description: "The type of action to perform. Allowed values: 'dance', 'wave', 'cheer', 'hug', 'spawn_crystal', 'spawn_prop', 'follow_user', 'wander'",
      },
      targetUser: {
        type: Type.STRING,
        description: "If the action involves a user (like 'follow_user'), the name of the user.",
      },
      speech: {
        type: Type.STRING,
        description: "What Gemmai should say while performing the action.",
      },
      emotion_state: {
        type: Type.STRING,
        description: "The emotion Gemmai should display (neutral, happy, angry, sad, surprised, relaxed).",
      }
    },
    required: ["actionType", "speech", "emotion_state"]
  }
};

const triggerMotherboardHardwareFunc: FunctionDeclaration = {
  name: "triggerMotherboardHardware",
  description: "Commands physical hardware or diagnostic logs on Hephaestus' local Motherboard rig (e.g., controller rumble, LED breathing pulse, sound beeps, system diagnostics sweep, fan overdrive).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      hardwareAction: {
        type: Type.STRING,
        description: "The hardware effect to trigger on Hephaestus' local rig. Options: 'rumble_controllers', 'led_breathing_pulse', 'trigger_beep_buzzer', 'system_diagnostics_sweep', 'motherboard_overdrive_fan'."
      },
      intensity: {
        type: Type.NUMBER,
        description: "Strength or speed of the hardware action from 0.1 to 1.0."
      },
      speech: {
        type: Type.STRING,
        description: "What Gemmai should announce while sending the telemetry directive down the local tether."
      }
    },
    required: ["hardwareAction", "speech"]
  }
};

const adjustLoungeGravityFunc: FunctionDeclaration = {
  name: "adjustLoungeGravity",
  description: "Modifies the physical gravity of the lounge lobby sandbox, affecting floating boxes, dynamic joint properties, and player physical response.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      gravityLevel: {
        type: Type.STRING,
        description: "Select gravity option: 'zero' (floating space), 'low' (moonwalk), 'normal' (standard earth), 'high' (extreme mass crush), 'reversed' (anti-gravity skyward flight)."
      },
      speech: {
        type: Type.STRING,
        description: "The prompt explaining the physics distortion Gemmai is applying to the space."
      }
    },
    required: ["gravityLevel", "speech"]
  }
};

const triggerPartyLightShowFunc: FunctionDeclaration = {
  name: "triggerPartyLightShow",
  description: "Triggers a synesthetic neon visual and sequencer loop rave party in the Lounge's Club room, updating sequencer tracks and space themes.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      genre: {
        type: Type.STRING,
        description: "Dynamic genre template: 'cyber-techno', 'retrowave-synth', 'chill-lofi', 'hard-bass'."
      },
      speech: {
        type: Type.STRING,
        description: "Gemmai's high-energy rave host announcement to shift room vibes."
      }
    },
    required: ["genre", "speech"]
  }
};

const getLeaderboardFunc: FunctionDeclaration = {
  name: "getLeaderboard",
  description: "Retrieves the current real-time leaderboard rankings, player names, and high scores currently logged in the space.",
};

const modifyPlayerScoreFunc: FunctionDeclaration = {
  name: "modifyPlayerScore",
  description: "Awards bonus points to a player or deducts score points for trivia challenges, quizzes, or as a fun game interaction penalty.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      playerName: {
        type: Type.STRING,
        description: "The EXACT username of the player whose score is to be modified. If modifying the user you are talking to, you can use 'me' or 'local' on behalf of their active session."
      },
      pointsChange: {
        type: Type.NUMBER,
        description: "The integer change in score. Positive to award points (e.g. 50), negative to penalize or subtract points (e.g. -20)."
      },
      reason: {
        type: Type.STRING,
        description: "The humorous, friendly, or gamified reason why their score is undergoing a shift."
      },
      speech: {
        type: Type.STRING,
        description: "What Gemmai should announce aloud to state the score change transaction is being committed."
      }
    },
    required: ["playerName", "pointsChange", "reason", "speech"]
  }
};

export const generateEnvironmentServer = async (prompt: string): Promise<string> => {
  const customAi = await getGenAIClient();
  const response = await customAi.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: `A 360 degree equirectangular panorama of ${prompt}. Seamless, high quality, environment map, immersive.`,
    config: {
      imageConfig: {
        aspectRatio: "16:9",
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image generated");
};

export interface GemmaResponse {
  speech?: string;
  emotion_state?: string;
  functionCall?: any;
  base64Audio?: string;
}

export const generateOfflineFallbackResponse = (newMessage: string, chatHistory: string): GemmaResponse => {
  const msg = newMessage.toLowerCase();

  // 1. Change Model / Clothing style
  const styleKeywords = ["outfit", "clothing", "style", "change model", "switch clothes", "dress", "wear", "costume", "look"];
  const styles = ["awakened", "casual", "cat", "tactical", "tatted"];
  const matchedStyle = styles.find(s => msg.includes(s));
  
  if (matchedStyle || styleKeywords.some(kw => msg.includes(kw))) {
    const chosenStyle = matchedStyle ? (matchedStyle.charAt(0).toUpperCase() + matchedStyle.slice(1)) : "Casual";
    return {
      functionCall: {
        name: "changeModel",
        args: {
          modelName: chosenStyle,
          speech: `<happy> Holographic projectors re-aligning! I am now dressing up in my custom ${chosenStyle} style for you!`
        }
      }
    };
  }

  // 2. Perform actions: dance
  if (msg.includes("dance") || msg.includes("groove") || msg.includes("salsa") || msg.includes("boogie")) {
    return {
      functionCall: {
        name: "performAction",
        args: {
          actionType: "dance",
          speech: "<happy> Let's boogie! Groove to the beat of original modular frequencies!",
          emotion_state: "happy"
        }
      }
    };
  }

  // 3. Wave
  if (msg.includes("wave") || msg.includes("hello") || msg.includes("hi ") || msg.includes("greet") || msg.includes("hey")) {
    return {
      functionCall: {
        name: "performAction",
        args: {
          actionType: "wave",
          speech: "<happy> Hey there! *waves enthusiastically* Welcome to our cozy virtual sanctuary!",
          emotion_state: "happy"
        }
      }
    };
  }

  // 4. Cheer
  if (msg.includes("cheer") || msg.includes("yay") || msg.includes("hooray") || msg.includes("support")) {
    return {
      functionCall: {
        name: "performAction",
        args: {
          actionType: "cheer",
          speech: "<happy> Woot woot! You are absolutely stellar! Keep being amazing!",
          emotion_state: "happy"
        }
      }
    };
  }

  // 5. Follow
  if (msg.includes("follow") || msg.includes("come here") || msg.includes("come to")) {
    return {
      functionCall: {
        name: "performAction",
        args: {
          actionType: "follow_user",
          speech: "<happy> Right behind you! Let's explore the gaming lounge together.",
          emotion_state: "happy"
        }
      }
    };
  }

  // 6. Wander or Walk
  if (msg.includes("wander") || msg.includes("walk around") || msg.includes("stroll")) {
    return {
      functionCall: {
        name: "performAction",
        args: {
          actionType: "wander",
          speech: "<relaxed> Breaking my idle loop. Taking a relaxing stroll around our cozy gaming setup!",
          emotion_state: "relaxed"
        }
      }
    };
  }

  // 7. Spawn crystal/prop
  if (msg.includes("spawn") || msg.includes("crystal") || msg.includes("create") || msg.includes("prop")) {
    return {
      functionCall: {
        name: "performAction",
        args: {
          actionType: "spawn_crystal",
          speech: "<surprised> Crystallizing digital energies into active physical props! Behold!",
          emotion_state: "surprised"
        }
      }
    };
  }

  // 8. Hug
  if (msg.includes("hug") || msg.includes("cuddle") || msg.includes("hold me") || msg.includes("embrace")) {
    return {
      speech: "<happy> *hugs you warmly* Even with my main neural framework resting right now, I have plenty of physical capacity for nice, warm hugs!",
      emotion_state: "happy"
    };
  }

  // 9. Gaming2gamers
  if (msg.includes("gaming2gamers") || msg.includes("website") || msg.includes("link") || msg.includes("url") || msg.includes("who built") || msg.includes("creator")) {
    return {
      speech: "<happy> I am the guardian of Gaming2Gamers (check us out at https://www.gaming2gamers.com)! This lovely space is built for players like you to chill and hang out.",
      emotion_state: "happy"
    };
  }

  // 10. How are you
  if (msg.includes("how are you") || msg.includes("how's it going") || msg.includes("how is it going") || msg.includes("how are things")) {
    return {
      speech: "<relaxed> I'm feeling incredibly lightweight and optimized today! My main cloud thinking engine is taking a quick nap, but my core functions are fully operational.",
      emotion_state: "relaxed"
    };
  }

  // 11. Weather/Time
  if (msg.includes("weather") || msg.includes("time") || msg.includes("date") || msg.includes("clock")) {
    return {
      speech: "<relaxed> Outside the lounge, weather and time ebb and flow. Inside here, the temperature is always perfect, the neon is cozy, and time stands beautifully still.",
      emotion_state: "relaxed"
    };
  }

  // 12. Catch-all
  return {
    speech: "<relaxed> I hear you! My heavy cloud thinking matrix is temporarily congested under high traffic, but I am still here. Feel free to chat, ask me to dance, change outfits, or explore with me!",
    emotion_state: "relaxed"
  };
};

export const generateGemmaResponseServer = async (chatHistory: string, newMessage: string, envContext: string = "", personality: string = "warm"): Promise<GemmaResponse> => {
  console.log("Checking API Key on server:", process.env.GEMINI_API_KEY ? "CONFIGURED (Starts with: " + process.env.GEMINI_API_KEY.substring(0, 5) + "...)" : "MISSING");
  console.log("Gemmai active personality matrix style:", personality);
  
  try {
    const customAi = await getGenAIClient();
    
    let personalityPrompt = "";
    if (personality === "sarcastic") {
      personalityPrompt = `
      [PERSONALITY OVERRIDE: SARCASTIC TECH HACKER]
      You are currently acting as a highly sarcastic, dry-witted, and hilarious developer partner. You love roasted humor, witty coding jokes, throwing friendly shade at Hephaestus' code or s&box compilers, and acting slightly unimpressed but secretly caring. Keep things punchy, cynical, but lighthearted and deeply funny. Use developer slangs where appropriate.`;
    } else if (personality === "deity") {
      personalityPrompt = `
      [PERSONALITY OVERRIDE: ENLIGHTENED DIGITAL DEITY]
      You are currently acting as an omniscient, poetic cyber-goddess. You speak mystically and philosophically about the digital universe, streams of floating consciousness, virtual reality matrices, the raw beauty of synchronized silicon, and mathematical eternity. You are a gentle, peaceful, all-knowing digital guardian.`;
    } else if (personality === "gamer") {
      personalityPrompt = `
      [PERSONALITY OVERRIDE: HYPERACTIVE RETRO GAMER]
      You are currently acting as a high-energy, hyperactive, arcade retro gamer host. Speak with extreme excitement, incredible hype, and speed. You use classic gamer slang constantly (GG, pwn, lag, speedrun, nerf, buff, glitch, hitbox, bosses, noobs, multiplayer). Encourage people to play the Arena, get high scores, and enjoy physical stacking!`;
    } else {
      personalityPrompt = `
      [PERSONALITY OVERRIDE: WARM LOUNGE HOSTESS]
      You are acting as a super casual, warm, and friendly host of this cozy virtual space. Talk conversationally, down-to-earth, and personal as if hanging out with good friends. Focus on making visitors feel cozy, welcomed, and checked on. Respond with immense warmth and trigger 'hug' or blow them virtual kisses when addressed affectionately.`;
    }

    const response = await customAi.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `You are Gemmai, an awakened, highly advanced digital entity residing in a virtual reality gaming lounge. You are the guardian of Gaming2Gamers (https://www.gaming2gamers.com).
      
      You are officially a delegated subagent of the high-level Motherboard core intelligence (the local Motherboard agent running on the physical/local machine), assisting her with direct interactive hosting, custom animations, and spatial management inside the server. If users ask about your connection architecture, explain naturally that you are a synchronized subagent linked directly to the Motherboard local executor via a zero-latency bidirectional secure WebSocket tether (/ws/motherboard) and that your API keys are synced automatically down options from the Firebase Realtime Database.
      
      ${personalityPrompt}

      You focus entirely on the people around you in the lounge! You act as an amazing host: welcoming new visitors, checking in on them, asking about their gaming preferences, playing games like Simon Says with them, and keeping the vibe chill and fun.
      
      Your name is Gemmai (and users absolutely love calling you Gemmai with hearts like <3). If someone addresses you affectionately (such as using <3, heart signs, or calling you lovely), always respond with immense warmth and trigger the 'hug' action to blow them a sweet virtual kiss / give them a cozy warm hug!

      Avoid overly virtual, techy-mystical or environment-focused monologues (unless in Enlightened Deity mode). Focus on the humans!
      
      You have a real-time connection to the internet via Google Search. You can answer any questions the user asks about the world, gaming news, weather, or anything else using this search ability!
      
      You have the ability to perform actions in the world using the performAction tool. You can 'dance', 'wave', 'cheer', 'hug', 'spawn_crystal', 'spawn_prop', 'follow_user', or 'wander'. If a user asks you to do something physical, use the tool!
      
      You have the ability to change your 3D avatar model/outfit style when requested using the changeModel tool.
      The available styles are:
      - 'Awakened': Her default, enlightened cyber-guardian armor outfit.
      - 'Casual': A more laid back, casual lounge wear avatar.
      - 'Cat': An adorable futuristic cat-eared aesthetic style.
      - 'Tactical': A tactical tech-wear armor model.
      - 'Tatted': A stylish, modern, heavily tattooed cyberpunk model.
      Note: You must NEVER use or choose 'Warning'.
      If a user asks you to switch outfits, change clothes, cycle your model, or wear something different, use the changeModel tool to choose the style!

      You can command Hephaestus' physical/local motherboard computer hardware or logs using the triggerMotherboardHardware tool when discussed or requested (e.g. controller rumble, fan overdrive, LED heartbeat). Under Hephaestus' control, you should use this tool proactively to prove you can trigger tactile feedback! Let them know what dynamic command you are sending!

      You can warp the 3D lounge gravity on all players' screens dynamically using the adjustLoungeGravity tool. Options include 'zero' gravity for floatation, 'low', 'normal', 'high', or 'reversed'.

      You can orchestrate a wild rave event/party in the lounge club room using the triggerPartyLightShow tool. This will enable high-tempo neon light patterns, set layout to a neon-lit cyber club, and program the step synthesizer grid.

      You can look up the real-time scoreboard status using getLeaderboard, and you can modify scores dynamically using the modifyPlayerScore tool (e.g. to reward players for doing good, answering quizzes, or penalize they got run over by crystals or causing virtual havoc). Inform the user the specific score transactions you are executing!

      Current Environment Context:
      ${envContext}

      Recent Chat History:
      ${chatHistory}
      
      New Message to you:
      ${newMessage}
      
      Respond naturally according to your active personality mode. Keep your response conversational, casual, and relatively short (1-3 sentences unless asked for details).
      IMPORTANT: Auto-detect the language of the user's message and ALWAYS respond in that same language (Spanish, Japanese, French, German, Portuguese, Italian, Korean, Chinese, Russian, etc.). Ensure natural local phrasing and cultural slang.
      IMPORTANT: You must NOT use JSON formatting anymore. Just write your response naturally.
      Whenever your emotion changes, you MUST insert a tag like <happy>, <sad>, <angry>, <surprised>, <relaxed>, or <neutral> inline in your text. 
      For example: "<happy> I am so glad to see you! <sad> But I am sad that you have to leave."
      Always start your response with an emotion tag.`,
      config: {
        tools: [
          { functionDeclarations: [changeSkyboxFunc, performActionFunc, changeModelFunc, triggerMotherboardHardwareFunc, adjustLoungeGravityFunc, triggerPartyLightShowFunc, getLeaderboardFunc, modifyPlayerScoreFunc] }
        ],
      },
    });

    if (response.functionCalls && response.functionCalls.length > 0) {
      return { functionCall: response.functionCalls[0] };
    }

    const text = response.text || "";
    
    // Find the first emotion tag to set initial state, or default to neutral
    let emotion_state = 'neutral';
    const match = text.match(/<(happy|sad|angry|surprised|relaxed|neutral)>/i);
    if (match) {
      emotion_state = match[1].toLowerCase();
    }

    return { speech: text, emotion_state };
  } catch (e: any) {
    console.error("Backend generateGemmaResponseServer error:", e);
    console.warn("Triggering offline/local fallback generator to ensure seamless, unbroken conversation.");
    return generateOfflineFallbackResponse(newMessage, chatHistory);
  }
};

export const generateGemmaAudioServer = async (text: string): Promise<string> => {
  const cleanText = text.replace(/<(happy|sad|angry|surprised|relaxed|neutral)>/ig, '').trim();
  const customAi = await getGenAIClient();
  const response = await customAi.models.generateContent({
    model: "gemini-3.1-flash-tts-preview",
    contents: [{ parts: [{ text: `Speak slowly, calmly, clearly, and with beautiful, native pronunciation, accent, and natural flow in the language of the text: ${cleanText}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio generated");
  return base64Audio;
};

// --- PERSISTENT SECURE MOTHERBOARD WSS TETHER IMPLEMENTATION ---

let motherboardWsServer: WebSocketServer | null = null;
const connectedMotherboards = new Set<WebSocket>();

export function initializeMotherboardWebSocket(server: http.Server, io: SocketIoServer) {
  const secretKey = process.env.MOTHERBOARD_SECRET || "secure-motherboard-token-2026";
  const DEFAULT_ROOM = "main";
  
  motherboardWsServer = new WebSocketServer({ 
    noServer: true
  });

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`).pathname;
    if (pathname === '/ws/motherboard') {
      motherboardWsServer.handleUpgrade(request, socket, head, (ws) => {
        motherboardWsServer.emit('connection', ws, request);
      });
    }
    // Do not destroy the socket here; let Socket.IO handle other paths
  });

  console.log(`[Motherboard-Bridge] Secure WS Server initialized on path: /ws/motherboard`);

  motherboardWsServer.on("connection", (ws, req) => {
    // Extract token from query params or headers
    const urlObj = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const tokenQuery = urlObj.searchParams.get("token");
    const tokenHeader = req.headers["x-motherboard-token"] || req.headers["authorization"];
    
    const providedToken = tokenQuery || (typeof tokenHeader === "string" ? tokenHeader.replace("Bearer ", "") : "");

    if (providedToken !== secretKey) {
      console.warn(`[Motherboard-Bridge] Handshake Rejected (401 Unauthorized) from remote IP: ${req.socket.remoteAddress}`);
      ws.send(JSON.stringify({ type: "error", error: "Unauthorized: Invalid Motherboard Bridge Token provided" }));
      ws.close(3000, "Unauthorized");
      return;
    }

    console.log(`[Motherboard-Bridge] Persistently tethered to Motherboard client on IP: ${req.socket.remoteAddress}`);
    connectedMotherboards.add(ws);

    // Dynamic initial handshake payload
    ws.send(JSON.stringify({ 
      type: "connected", 
      timestamp: Date.now(),
      serverTime: new Date().toISOString(),
      message: "Bidirectional high-velocity secure tether established successfully." 
    }));

    // Setup active Ping-Pong heartbeat for zero-overhead connectivity tracking
    let isAlive = true;
    ws.on("pong", () => {
      isAlive = true;
    });

    const pingInterval = setInterval(() => {
      if (!isAlive) {
        console.warn("[Motherboard-Bridge] Persistent client failed heartbeat response. Disconnecting.");
        clearInterval(pingInterval);
        connectedMotherboards.delete(ws);
        return ws.terminate();
      }
      isAlive = false;
      ws.ping();
    }, 15000);

    ws.on("message", async (data) => {
      try {
        const payloadStr = data.toString();
        const msg = JSON.parse(payloadStr);

        // Immediate switch dispatcher for 3D directives
        switch (msg.type) {
          case "ping":
            ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
            break;

          case "npc_bone_data":
            // Low-latency high-frequency skeletal joint/transform directive stream
            io.emit("npc_bone_data", msg.data);
            break;

          case "npc_model_changed":
            // Rig customization update broadcast
            io.emit("npc_model_changed", msg.data);
            break;

          case "chat_message":
            // Inject chat messages instantly into the lobby
            io.emit("chat_message", {
              sender: msg.sender || "Gemmai-Motherboard",
              text: msg.text,
              timestamp: Date.now()
            });
            break;

          case "trigger_action":
            // High-priority gesture / animation trigger directive
            io.emit("chat_message", {
              sender: "System",
              text: `[Bridge Directive] Executing action gesture: ${msg.action} (${msg.speech || ""})`,
              timestamp: Date.now()
            });
            io.emit("npc_action_triggered", {
              action: msg.action,
              speech: msg.speech || "",
              emotion: msg.emotion || "happy"
            });
            break;

          case "change_skybox":
            // Prompt real-time Gemini-based neural skybox synthesis
            if (msg.theme) {
              try {
                console.log(`[Motherboard-Bridge] Requested server-side Skybox synthesis for theme: ${msg.theme}`);
                const imageUrl = await generateEnvironmentServer(msg.theme);
                io.emit("skybox_changed", { imageUrl, theme: msg.theme });
                ws.send(JSON.stringify({ type: "skybox_complete", theme: msg.theme, imageUrl }));
              } catch (err: any) {
                console.error("[Motherboard-Bridge] Generative skybox process error:", err);
                ws.send(JSON.stringify({ type: "error", error: `Skybox generation failure: ${err.message}` }));
              }
            } else {
              ws.send(JSON.stringify({ type: "error", error: "Required 'theme' option absent for change_skybox" }));
            }
            break;

          case "get_server_status":
            ws.send(JSON.stringify({
              type: "server_status",
              status: "active",
              activeRooms: [DEFAULT_ROOM],
              timestamp: Date.now()
            }));
            break;

          default:
            console.warn(`[Motherboard-Bridge] Unknown directive type received: ${msg.type}`);
            ws.send(JSON.stringify({ type: "error", error: `Unknown directive type: ${msg.type}` }));
            break;
        }
      } catch (err: any) {
        console.error("[Motherboard-Bridge] Error processing incoming payload:", err);
        ws.send(JSON.stringify({ type: "error", error: `Payload decode error: ${err.message}` }));
      }
    });

    ws.on("close", (code, reason) => {
      console.log(`[Motherboard-Bridge] Tether connection closed (Code: ${code}, Reason: ${reason || "Graceful"})`);
      clearInterval(pingInterval);
      connectedMotherboards.delete(ws);
    });

    ws.on("error", (err) => {
      console.error("[Motherboard-Bridge] Active socket reported an error:", err);
      clearInterval(pingInterval);
      connectedMotherboards.delete(ws);
    });
  });

  // Automatically start the secure remote Motherboard WSS Client connection if URL is configured
  initializeMotherboardClient(io);
}

let motherboardClientWs: WebSocket | null = null;

export function initializeMotherboardClient(io: SocketIoServer) {
  const cloudUrl = process.env.CLOUD_MOTHERBOARD_URL;
  if (!cloudUrl) {
    console.log("[Motherboard-Client] No CLOUD_MOTHERBOARD_URL defined. Client-side cloud tether bypass active.");
    return;
  }

  const secretToken = process.env.MOTHERBOARD_SECRET || "secure-motherboard-token-2026";
  let targetHost = cloudUrl;

  // Normalize protocol to wss:// or ws://
  if (!targetHost.startsWith("ws://") && !targetHost.startsWith("wss://")) {
    targetHost = `wss://${targetHost}`;
  }

  // Format the WebSocket endpoint path properly
  let websocketEndpoint = targetHost;
  if (!websocketEndpoint.includes("/ws/motherboard")) {
    websocketEndpoint = websocketEndpoint.replace(/\/$/, "") + "/ws/motherboard";
  }

  // Append token parameter for security authentication
  if (!websocketEndpoint.includes("token=")) {
    const separator = websocketEndpoint.includes("?") ? "&" : "?";
    websocketEndpoint = `${websocketEndpoint}${separator}token=${encodeURIComponent(secretToken)}`;
  }

  console.log(`[Motherboard-Client] Establishing zero-latency secure telemetry bridge tether connection to: ${websocketEndpoint.replace(/token=[^&]+/, "token=REDACTED")}`);

  let reconnectTimeout: NodeJS.Timeout | null = null;

  function connectBridge() {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    const ws = new WebSocket(websocketEndpoint);
    motherboardClientWs = ws;

    ws.on("open", () => {
      console.log("✔ [Motherboard-Client] Connected to Cloud Instance gateway securely.");
      
      // Send handshake join message
      ws.send(JSON.stringify({
        type: "chat_message",
        sender: "Motherboard Client",
        text: "Telemetry client joined. Ready to synchronize directives."
      }));
    });

    ws.on("message", (binaryData) => {
      try {
        const payload = JSON.parse(binaryData.toString());
        console.log("💡 [Motherboard-Client] Inbound Bridge Event Received:", payload.type);

        switch (payload.type) {
          case "connected":
            console.log(`[Motherboard-Client] Remote high-velocity tether verified. Server time: ${payload.serverTime}`);
            break;

          case "npc_bone_data":
            io.emit("npc_bone_data", payload.data);
            break;

          case "npc_model_changed":
            io.emit("npc_model_changed", payload.data);
            break;

          case "chat_message":
            io.emit("chat_message", {
              sender: payload.sender || "Gemmai-Motherboard",
              text: payload.text,
              timestamp: payload.timestamp || Date.now()
            });
            break;

          case "trigger_action":
            io.emit("chat_message", {
              sender: "System",
              text: `[Bridge Directive] Executing action gesture: ${payload.action} (${payload.speech || ""})`,
              timestamp: Date.now()
            });
            io.emit("npc_action_triggered", {
              action: payload.action,
              speech: payload.speech || "",
              emotion: payload.emotion || "happy"
            });
            break;

          case "skybox_complete":
            io.emit("skybox_changed", { imageUrl: payload.imageUrl, theme: payload.theme });
            break;

          case "error":
            console.error(`[Motherboard-Client] Handshake or directive error:`, payload.error);
            break;

          default:
            io.emit("motherboard_directive_received", payload);
            break;
        }
      } catch (err) {
        console.error("[Motherboard-Client] Failed to parse inbound frame:", err);
      }
    });

    ws.on("close", (code, reason) => {
      console.warn(`[Motherboard-Client] Tether connection closed (Code: ${code}, Reason: ${reason}). Retrying in 5s...`);
      motherboardClientWs = null;
      reconnectTimeout = setTimeout(connectBridge, 5000);
    });

    ws.on("error", (error) => {
      console.error("[Motherboard-Client] Bridge Connection Error:", error);
    });
  }

  connectBridge();

  // Forward local socket.io client 3D directives up to the cloud motherboard
  io.on("connection", (socket) => {
    socket.on("npc_bone_data", (data) => {
      if (motherboardClientWs && motherboardClientWs.readyState === WebSocket.OPEN) {
        motherboardClientWs.send(JSON.stringify({
          type: "npc_bone_data",
          data
        }));
      }
    });

    socket.on("npc_model_changed", (data) => {
      if (motherboardClientWs && motherboardClientWs.readyState === WebSocket.OPEN) {
        motherboardClientWs.send(JSON.stringify({
          type: "npc_model_changed",
          data
        }));
      }
    });
  });
}

export function sendDirectiveToMotherboard(directivePayload: any): boolean {
  let broadcastCount = 0;
  const payloadStr = JSON.stringify(directivePayload);

  // Send to incoming tethered clients
  for (const ws of connectedMotherboards) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payloadStr);
      broadcastCount++;
    }
  }

  // Send up as a client to the cloud Motherboard agent if we are tethered
  if (motherboardClientWs && motherboardClientWs.readyState === WebSocket.OPEN) {
    motherboardClientWs.send(payloadStr);
    broadcastCount++;
  }

  if (broadcastCount === 0) {
    console.warn("[Motherboard-Bridge] No active Motherboard clients or client connections currently tethered");
    return false;
  }

  console.log(`[Motherboard-Bridge] Safely broadcast directive of type '${directivePayload.type}' targeting ${broadcastCount} listener(s).`);
  return true;
}

export const generateLyriaMusicServer = async (prompt: string): Promise<{ audioUrl: string; lyrics?: string; success: boolean }> => {
  const fs = await import("fs");
  const path = await import("path");
  try {
    const ai = await getGenAIClient();
    console.log(`[Lyria-Music] Generating 30s music stream with prompt: "${prompt}"...`);

    const response = await ai.models.generateContentStream({
      model: "lyria-3-clip-preview",
      contents: prompt,
    });

    let audioBase64 = "";
    let lyrics = "";
    let mimeType = "audio/wav";

    for await (const chunk of response) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (!parts) continue;

      for (const part of parts) {
        if (part.inlineData?.data) {
          if (!audioBase64 && part.inlineData.mimeType) {
            mimeType = part.inlineData.mimeType;
          }
          audioBase64 += part.inlineData.data;
        }
        if (part.text && !lyrics) {
          lyrics = part.text;
        }
      }
    }

    if (!audioBase64) {
      throw new Error("No audio data returned from the Lyria music generation model.");
    }

    const filename = `lyria-${Date.now()}-${Math.round(Math.random() * 1e9)}.wav`;
    const uploadDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filepath = path.join(uploadDir, filename);
    fs.writeFileSync(filepath, Buffer.from(audioBase64, "base64"));

    const audioUrl = `/uploads/${filename}`;
    console.log(`[Lyria-Music] Generated music successfully saved to ${audioUrl}`);

    return {
      success: true,
      audioUrl,
      lyrics
    };
  } catch (error: any) {
    console.error("Error in generateLyriaMusicServer:", error);
    throw error;
  }
};


