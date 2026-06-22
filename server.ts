import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import http from "http";
import https from "https";
import { URL } from "url";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Ensure data directory exists
const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const usersFile = path.join(dataDir, "users.json");

// Load persisted users
let persistedUsers = new Map();
if (fs.existsSync(usersFile)) {
  try {
    const data = fs.readFileSync(usersFile, "utf-8");
    persistedUsers = new Map(JSON.parse(data));
  } catch (err) {
    console.error("Failed to load users.json:", err);
  }
}

function saveUsers() {
  try {
    fs.writeFileSync(usersFile, JSON.stringify(Array.from(persistedUsers.entries()), null, 2));
  } catch (err) {
    console.error("Failed to save users.json:", err);
  }
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: "*" }
  });
  const PORT = 3000;

  // --- SECURE MOTHERBOARD WSS TETHER INITIALIZATION ---
  const { initializeMotherboardWebSocket } = await import("./src/services/ai.server");
  initializeMotherboardWebSocket(server, io);

  // Serve uploaded files with CORS headers
  app.use('/uploads', express.static(uploadDir, {
    setHeaders: (res) => {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Range');
    }
  }));

  // Serve Gemmai models with CORS headers
  const gemmaiDir = path.join(process.cwd(), "Gemmai");
  app.use('/Gemmai', express.static(gemmaiDir, {
    setHeaders: (res) => {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Range');
    }
  }));

  // Generic CORS middleware fallback for API and signaling endpoints
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Range");
    res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // Default rooms config
  const DEFAULT_ROOM = "main";

  // API routes

  app.post('/api/log-error', express.json(), (req, res) => {
    fs.appendFileSync('browser-errors.log', JSON.stringify(req.body) + '\n');
    console.log(req.body);
    res.sendStatus(200);
  });
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // --- SECURE BACKEND GEMINI ROUTER PROXIES ---
  app.post("/api/generate-environment", express.json(), async (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt) return res.status(400).json({ error: "Missing prompt" });
      const { generateEnvironmentServer } = await import("./src/services/ai.server");
      const imageUrl = await generateEnvironmentServer(prompt);
      res.json({ imageUrl });
    } catch (e: any) {
      console.error("Server API generate-environment error:", e);
      res.status(500).json({ error: e.message || "Failed to generate environment" });
    }
  });

  app.post("/api/generate-gemma-response", express.json(), async (req, res) => {
    try {
      const { chatHistory, newMessage, envContext } = req.body;
      const { generateGemmaResponseServer } = await import("./src/services/ai.server");
      const result = await generateGemmaResponseServer(chatHistory, newMessage, envContext);
      res.json(result);
    } catch (e: any) {
      console.error("Server API generate-gemma-response error:", e);
      res.status(500).json({ error: e.message || "Failed to generate response" });
    }
  });

  app.post("/api/generate-gemma-audio", express.json(), async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) return res.status(400).json({ error: "Missing text" });
      const { generateGemmaAudioServer } = await import("./src/services/ai.server");
      const base64Audio = await generateGemmaAudioServer(text);
      res.json({ base64Audio });
    } catch (e: any) {
      console.error("Server API generate-gemma-audio error:", e);
      res.status(500).json({ error: e.message || "Failed to generate audio" });
    }
  });

  app.post("/api/motherboard-directive", express.json(), async (req, res) => {
    try {
      const { directive } = req.body;
      if (!directive) return res.status(400).json({ error: "Missing directive" });
      const { sendDirectiveToMotherboard } = await import("./src/services/ai.server");
      const success = sendDirectiveToMotherboard(directive);
      res.json({ success });
    } catch (e: any) {
      console.error("Server API motherboard-directive error:", e);
      res.status(500).json({ error: e.message || "Failed to transmit motherboard directive" });
    }
  });

  // VRMA Sign Language Animation Indexer
  let cachedVrmaIndex: any[] | null = null;
  app.get("/api/list-vrma-animations", async (req, res) => {
    try {
      const bypassCache = req.query.bypassCache === "true" || req.query.refresh === "true";
      if (cachedVrmaIndex && !bypassCache) {
        return res.json({ success: true, animations: cachedVrmaIndex });
      }

      // Priority load our beautifully pre-compiled 2232-word static index!
      // This reduces startup/API times to sub-milliseconds and bypasses GCS API quotas.
      if (!bypassCache) {
        try {
          const staticIndexPath = path.join(process.cwd(), "src", "data", "vrma_index.json");
          if (fs.existsSync(staticIndexPath)) {
            const fileData = fs.readFileSync(staticIndexPath, "utf8");
            const parsedArray = JSON.parse(fileData);
            if (Array.isArray(parsedArray) && parsedArray.length > 0) {
              cachedVrmaIndex = parsedArray;
              console.log(`[VRMA-Indexer] Priority loaded ${parsedArray.length} static index words from local vrma_index.json`);
              return res.json({ success: true, animations: parsedArray });
            }
          }
        } catch (staticErr) {
          console.warn("[VRMA-Indexer] Static index asset load failed, falling back to live GCS scrape:", staticErr);
        }
      }

      const bucketName = "gemmai-lounge-assets";
      const prefix = "VRM/VRMA/SL/";
      let rawItems: any[] = [];
      let pageToken = "";
      let fetchSuccess = false;

      try {
        console.log("[VRMA-Indexer] Scraping files from public Cloud Storage bucket...");
        do {
          const url = `https://storage.googleapis.com/storage/v1/b/${bucketName}/o?prefix=${encodeURIComponent(prefix)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
          const gcsRes = await fetch(url);
          if (gcsRes.ok) {
            const data: any = await gcsRes.json();
            if (data.items && Array.isArray(data.items)) {
              rawItems = rawItems.concat(data.items);
            }
            pageToken = data.nextPageToken || "";
            fetchSuccess = true;
          } else {
            console.warn(`[VRMA-Indexer] GCS API returned error status: ${gcsRes.status}`);
            break;
          }
        } while (pageToken);
      } catch (gcsError) {
        console.warn("[VRMA-Indexer] GCS API fetch threw error:", gcsError);
      }

      // XML public listing API as secondary fallback if JSON API failed or rate-limited
      if (!fetchSuccess || rawItems.length === 0) {
        try {
          console.log("[VRMA-Indexer] JSON API returned empty or failed. Trying anonymous XML API...");
          const xmlUrl = `https://gemmai-lounge-assets.storage.googleapis.com/?prefix=${encodeURIComponent(prefix)}`;
          const xmlRes = await fetch(xmlUrl);
          if (xmlRes.ok) {
            const xmlText = await xmlRes.text();
            const keyRegex = /<Key>([^<]+)<\/Key>/g;
            let match;
            while ((match = keyRegex.exec(xmlText)) !== null) {
              const fullKey = match[1];
              if (fullKey.toLowerCase().endsWith(".vrma")) {
                rawItems.push({
                  name: fullKey
                });
              }
            }
            if (rawItems.length > 0) {
              fetchSuccess = true;
              console.log(`[VRMA-Indexer] XML fallback successfully scraped ${rawItems.length} items`);
            }
          }
        } catch (xmlErr) {
          console.warn("[VRMA-Indexer] XML fallback listing failed:", xmlErr);
        }
      }

      let parsedAnimations: any[] = [];
      const animMap = new Map<string, any>();

      if (fetchSuccess && rawItems.length > 0) {
        for (const item of rawItems) {
          if (!item.name || !item.name.toLowerCase().endsWith(".vrma")) continue;

          const parts = item.name.split('/');
          const filename = parts[parts.length - 1];

          let keyword = "";
          const dateMatch = filename.match(/SG\s+ASL\s+(.*?)\s+\d{4}-\d{1,2}-\d{1,2}/i);
          if (dateMatch) {
            keyword = dateMatch[1].toLowerCase().trim();
          } else {
            keyword = filename
              .replace(/^SG\s+ASL\s+/i, '')
              .replace(/No\s+Mesh.*$/i, '')
              .replace(/\.vrma$/i, '')
              .toLowerCase()
              .trim();
          }

          if (!keyword) continue;

          let rootWord = keyword;
          // Clear standard brackets & numbers
          rootWord = rootWord.replace(/\s*\(alt\)/g, '');
          const trailingNumMatch = rootWord.match(/^(.*?)\s+\d+$/);
          if (trailingNumMatch) {
            rootWord = trailingNumMatch[1].toLowerCase().trim();
          }

          const publicUrl = `https://storage.googleapis.com/gemmai-lounge-assets/${encodeURIComponent(item.name)}`;
          const isV2 = item.name.toLowerCase().includes("/version2/");

          const animObj = {
            name: filename,
            path: item.name,
            url: publicUrl,
            keyword,
            rootWord: rootWord !== keyword ? rootWord : undefined,
            isV2
          };

          const existing = animMap.get(keyword);
          if (!existing || (isV2 && !existing.isV2)) {
            animMap.set(keyword, animObj);
          }
        }
        parsedAnimations = Array.from(animMap.values());
      }

      // If GCS failed or returned empty, populate rich safe fallbacks
      if (parsedAnimations.length === 0) {
        console.log("[VRMA-Indexer] Utilizing safe local / preset ASL fallback mappings.");
        const fallbackLetters = [
          "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
          "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
          "adhd", "alt", "writing", "zone", "atm", "antigravity"
        ];

        parsedAnimations = fallbackLetters.map(letter => {
          let filename = `SG ASL ${letter.toUpperCase()} 2024-6-16 No Mesh Mixamo.vrma`;
          if (letter === "0") filename = "SG ASL 0 2024-6-17 No Mesh Mixamo.vrma";
          else if (letter === "1") filename = "SG ASL 1 2024-6-15 No Mesh Mixamo.vrma";
          else if (letter === "10") filename = "SG ASL 10 2024-6-15 No Mesh Mixamo.vrma";
          else if (["2", "3", "4", "5", "6"].includes(letter)) filename = `SG ASL ${letter} 2024-6-15 No Mesh Mixamo.vrma`;
          else if (["7", "8", "9"].includes(letter)) filename = `SG ASL ${letter} 2024-6-16 No Mesh Mixamo.vrma`;
          else if (letter === "adhd") filename = "SG ASL ADHD 1 2023-8-16 No Mesh Mixamo.vrma";
          else if (letter === "alt") filename = "SG ASL Alt 1 2023-9-5 No Mesh Mixamo.vrma";
          else if (letter === "writing") filename = "SG ASL Writing 2023-9-5 No Mesh Mixamo.vrma";
          else if (letter === "zone") filename = "SG ASL Zone 2023-9-6 No Mesh Mixamo.vrma";
          else if (letter === "atm") filename = "SG ASL ATM 2 2023-10-12 No Mesh Mixamo.vrma";
          else if (letter === "antigravity") filename = "SG ASL Antigravity 1 2023-7-10 No Mesh Mixamo.vrma";

          return {
            name: filename,
            path: `VRM/VRMA/SL/${filename}`,
            url: `https://storage.googleapis.com/gemmai-lounge-assets/VRM/VRMA/SL/${encodeURIComponent(filename)}`,
            keyword: letter,
            rootWord: letter
          };
        });
      }

      cachedVrmaIndex = parsedAnimations;
      console.log(`[VRMA-Indexer] Successfully indexed ${parsedAnimations.length} sign language animations`);
      res.json({ success: true, animations: parsedAnimations });
    } catch (err: any) {
      console.error("VRMA indexer crashed:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to index VRMA assets" });
    }
  });


  app.post("/api/verify-captcha", express.json(), async (req, res) => {
    console.log("verify-captcha hit!");
    const { token } = req.body;
    if (!token) {
      console.log("Missing token");
      return res.status(400).json({ success: false, error: "Missing token" });
    }
    
    // If not configured, we'll just bypass and return true (for dev)
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    if (!secretKey) {
      console.log("Bypassing captcha (no secret configured)");
      return res.json({ success: true, bypassed: true });
    }

    try {
      const response = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret: secretKey, response: token })
      });
      const data = await response.json();
      console.log("Captcha verification response:", data);
      res.json(data);
    } catch (err) {
      console.error("reCAPTCHA Error:", err);
      res.status(500).json({ success: false, error: "Verification failed" });
    }
  });

  // Serve an upload portal
  app.get("/upload-portal", (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Secret Upload Portal</title>
        <style>
          body { font-family: system-ui; background: #111; color: #fff; padding: 2rem; }
          .container { max-width: 600px; margin: 0 auto; background: #222; padding: 2rem; border-radius: 8px; border: 1px solid #333; }
          h1 { color: #0df; }
          .form-group { margin-bottom: 1rem; }
          input[type=file] { margin-top: 0.5rem; display: block; }
          button { background: #0df; color: #000; padding: 0.5rem 1rem; border: none; font-weight: bold; cursor: pointer; margin-top: 1rem; }
          button:hover { background: #0cf; }
          #result { margin-top: 1rem; white-space: pre-wrap; font-family: monospace; color: #0f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Backend Upload Portal</h1>
          <p>Use this to upload large GLB/ZIP files directly to the server's uploads folder.</p>
          <form id="uploadForm">
            <div class="form-group">
              <label>Select Files (You can select multiple)</label>
              <input type="file" id="fileInput" name="files" multiple required />
            </div>
            <button type="submit">Upload Files</button>
          </form>
          <div id="result"></div>
        </div>
        <script>
          document.getElementById('uploadForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const resultDiv = document.getElementById('result');
            resultDiv.textContent = 'Uploading...';
            
            const formData = new FormData();
            const files = document.getElementById('fileInput').files;
            for (let i = 0; i < files.length; i++) {
              formData.append('files', files[i]);
            }
            
            try {
              const res = await fetch('/api/upload-files', {
                method: 'POST',
                body: formData
              });
              const data = await res.json();
              if (res.ok) {
                resultDiv.textContent = 'Upload Successful!\\n\\nPaths:\\n' + data.files.map(f => f.url).join('\\n');
              } else {
                resultDiv.textContent = 'Error: ' + JSON.stringify(data.error);
              }
            } catch (err) {
              resultDiv.textContent = 'Error: ' + err.message;
            }
          });
        </script>
      </body>
      </html>
    `);
  });

  app.post("/api/upload-files", upload.array('files', 10), (req, res) => {
    if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }
    const files = (req.files as Express.Multer.File[]).map(f => ({
      originalName: f.originalname,
      filename: f.filename,
      url: `/uploads/${f.filename}`
    }));
    res.json({ files });
  });

  app.post("/api/upload-vrm", upload.single('vrm'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  });

  // OAuth State Storage
  const oauthStates = new Map<string, string>();

  // --- OAUTH VROID FLOW ---
  app.get("/auth/vroid", (req, res) => {
    const clientId = process.env.VROID_CLIENT_ID;
    const redirectUri = `${process.env.APP_URL}/auth/callback`;
    if (!clientId) {
      return res.status(500).send("VROID_CLIENT_ID not configured");
    }
    
    // Generate PKCE code_verifier and code_challenge
    const state = crypto.randomBytes(16).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    oauthStates.set(state, codeVerifier);

    // Clean up state after 10 minutes to prevent memory leaks
    setTimeout(() => {
      oauthStates.delete(state);
    }, 10 * 60 * 1000);

    const authUrl = `https://hub.vroid.com/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=default&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
    res.redirect(authUrl);
  });

  app.get("/auth/callback", async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(400).send("Missing authorization code or state");
    }

    const codeVerifier = oauthStates.get(state as string);
    if (!codeVerifier) {
      return res.status(400).send("Invalid or expired state");
    }
    oauthStates.delete(state as string);

    try {
      const clientId = process.env.VROID_CLIENT_ID;
      const clientSecret = process.env.VROID_CLIENT_SECRET;
      const redirectUri = `${process.env.APP_URL}/auth/callback`;

      const params = new URLSearchParams();
      params.append('client_id', clientId!);
      params.append('client_secret', clientSecret!);
      params.append('redirect_uri', redirectUri);
      params.append('grant_type', 'authorization_code');
      params.append('code', code as string);
      params.append('code_verifier', codeVerifier);

      const response = await fetch('https://hub.vroid.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString()
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error_description || data.error || 'Failed to exchange token');
      }

      // Send the token back to the opening window using postMessage
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage(
                  { type: 'VROID_AUTH_SUCCESS', access_token: '${data.access_token}' },
                  '*'
                );
                window.close();
              } else {
                document.body.innerHTML = 'Authentication successful! You can close this tab and return to the app. <br><button onclick="window.close()">Close</button>';
                localStorage.setItem('vroid_token', '${data.access_token}');
              }
            </script>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error('OAuth Callback Error:', err);
      res.status(500).send(`Authentication failed: ${err.message}`);
    }
  });

  // --- VRoid API Proxy ---
  // Proxies requests to VRoid Hub API to avoid CORS issues and inject headers
  app.all("/api/vroid/*", express.json(), async (req, res) => {
    const token = req.headers.authorization;
    const apiPath = req.params[0];
    
    if (!token) {
      return res.status(401).json({ error: "Missing authorization header" });
    }

    try {
      const queryParams = new URLSearchParams(req.query as any).toString();
      const url = `https://hub.vroid.com/api/v1/${apiPath}${queryParams ? '?' + queryParams : ''}`;
      
      const headers: Record<string, string> = {
        'Authorization': token,
        'X-Api-Version': '11',
        'Accept': 'application/json',
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      };

      if (req.headers['content-type']) {
        headers['Content-Type'] = req.headers['content-type'] as string;
      } else if (req.method !== 'GET' && req.method !== 'HEAD') {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(url, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
        redirect: 'manual'
      });
      
      // If the API returns a redirect (e.g. to S3 for download)
      if (response.status >= 300 && response.status < 400) {
        return res.json({ data: { url: response.headers.get('location') || response.headers.get('Location') } });
      }
      
      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (err) {
        console.warn('VRoid API non-JSON response:', text.substring(0, 100));
        data = { error: "Invalid JSON from VRoid API", html: text.substring(0, 100) };
      }
      res.status(response.status).json(data);
    } catch (err: any) {
      console.error('VRoid API Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Robust download/proxy utility handling redirections and SSL/TCP details natively
  function robustGet(targetUrl: string): Promise<{ headers: any; statusCode: number; data: Buffer }> {
    return new Promise((resolve, reject) => {
      try {
        const parsedUrl = new URL(targetUrl);
        const client = parsedUrl.protocol === "https:" ? https : http;
        const req = client.get(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          }
        }, (res) => {
          // Follow HTTP/HTTPS redirection
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            let redirectUrl = res.headers.location;
            if (!redirectUrl.startsWith("http")) {
              redirectUrl = new URL(redirectUrl, targetUrl).href;
            }
            robustGet(redirectUrl).then(resolve).catch(reject);
            return;
          }

          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            resolve({
              headers: res.headers,
              statusCode: res.statusCode || 200,
              data: Buffer.concat(chunks)
            });
          });
        });

        req.on("error", (err) => {
          reject(err);
        });

        req.setTimeout(15000, () => {
          req.destroy();
          reject(new Error("Request timeout"));
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  app.get('/api/proxy-vrm', async (req, res) => {
    const vrmUrl = req.query.url as string;
    if (!vrmUrl) return res.status(400).send("Missing URL");

    // Redirect relative/local URLs instead of attempting server-side fetch
    if (!vrmUrl.startsWith('http://') && !vrmUrl.startsWith('https://')) {
      return res.redirect(vrmUrl);
    }

    try {
      const result = await robustGet(vrmUrl);
      if (result.statusCode !== 200) {
        console.error("Proxy VRM received bad status:", result.statusCode);
        return res.status(result.statusCode).send("Proxy bad status");
      }
      res.set('Content-Type', result.headers['content-type'] || 'application/octet-stream');
      const contentLength = result.headers['content-length'];
      if (contentLength) {
        res.set('Content-Length', contentLength);
      }
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
      res.send(result.data);
    } catch (e: any) {
      console.error("Proxy VRM Error:", e);
      res.status(500).send("Proxy error");
    }
  });

  // Socket.io State
  const activeUsers = new Map();
  const crystalsByRoom = new Map();
  const physicsPropsByRoom = new Map();
  const sequencerGridsByRoom = new Map();

  function getSequencerGridForRoom(roomId: string) {
    if (!sequencerGridsByRoom.has(roomId)) {
      // 4 tracks (Kick, Snare, HiHat, Synth), 16 steps
      const grid = Array(4).fill(null).map(() => Array(16).fill(false));
      sequencerGridsByRoom.set(roomId, grid);
    }
    return sequencerGridsByRoom.get(roomId);
  }

  function getCrystalsForRoom(roomId: string) {
    if (!crystalsByRoom.has(roomId)) {
      const crystals = new Map();
      for (let i = 0; i < 15; i++) {
        const id = `crystal-${roomId}-${i}`;
        crystals.set(id, {
          id,
          position: [(Math.random() - 0.5) * 40, 1 + Math.random() * 3.5, (Math.random() - 0.5) * 40]
        });
      }
      crystalsByRoom.set(roomId, crystals);
    }
    return crystalsByRoom.get(roomId);
  }

  function getPropsForRoom(roomId: string) {
    if (!physicsPropsByRoom.has(roomId)) {
      const props = new Map();
      for (let i = 0; i < 15; i++) {
        const id = `prop-${roomId}-${i}`;
        props.set(id, {
          id,
          position: [Math.random() * 20 - 10, 5 + i * 2, Math.random() * 20 - 10],
          color: `hsl(${Math.random() * 360}, 80%, 60%)`
        });
      }
      physicsPropsByRoom.set(roomId, props);
    }
    return physicsPropsByRoom.get(roomId);
  }

  getCrystalsForRoom(DEFAULT_ROOM);
  getPropsForRoom(DEFAULT_ROOM);

  const MAX_PLAYERS = 60;
  let playerCounter = 1;
  const players: Record<string, { id: string, name: string, position: [number, number, number], rotation: number, state: 'active' | 'disabled', disabledUntil: number, score: number, color: string, vrmUrl?: string }> = {};

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // --- NEON ARENA MULTIPLAYER ---
    socket.on('joinGame', (data) => {
      if (Object.keys(players).length >= MAX_PLAYERS) {
        socket.emit('gameError', 'Server is full (60/60 players)');
        return;
      }
      const colors = ['#ff0055', '#00ff00', '#ffff00', '#ff00ff', '#00ffff'];
      const color = colors[Object.keys(players).length % colors.length];
      const playerName = `Player ${playerCounter++}`;
      players[socket.id] = {
        id: socket.id,
        name: playerName,
        position: [0, 2, 0],
        rotation: 0,
        state: 'active',
        disabledUntil: 0,
        score: 0,
        color,
        vrmUrl: data?.vrmUrl
      };
      socket.emit('gameJoined', players);
      socket.broadcast.emit('playerJoined', players[socket.id]);
    });

    socket.on('updatePosition', (data: { position: [number, number, number], rotation: number }) => {
      if (players[socket.id]) {
        players[socket.id].position = data.position;
        players[socket.id].rotation = data.rotation;
        socket.broadcast.emit('playerMoved', { id: socket.id, ...data });
      }
    });

    socket.on('shoot', (data: { start: [number, number, number], end: [number, number, number], color: string }) => {
      socket.broadcast.emit('playerShot', { id: socket.id, ...data });
    });

    socket.on('leroyCharge', () => {
      socket.broadcast.emit('playerLeroyCharge', { id: socket.id });
    });

    socket.on('hitPlayer', (targetId: string) => {
      if (players[targetId] && players[socket.id]) {
        const now = Date.now();
        if (players[targetId].state === 'active' || now > players[targetId].disabledUntil) {
          players[targetId].state = 'disabled';
          players[targetId].disabledUntil = now + 3000;
          players[socket.id].score += 100;
          io.emit('playerHit', {
            targetId,
            shooterId: socket.id,
            targetDisabledUntil: players[targetId].disabledUntil,
            shooterScore: players[socket.id].score
          });
        }
      }
    });

    // --- LOUNGE MULTIPLAYER ---
    socket.on("join", (userData) => {
      const userId = userData.id || socket.id;
      socket.data.userId = userId;
      
      const roomId = userData.roomId || DEFAULT_ROOM;
      socket.join(roomId);
      
      let finalUserData = { ...userData, id: userId, roomId, socketId: socket.id };

      if (userData.name && persistedUsers.has(userData.name)) {
        const savedUser = persistedUsers.get(userData.name);
        finalUserData.score = savedUser.score;
        finalUserData.vrmUrl = savedUser.vrmUrl || userData.vrmUrl;
        
        socket.emit("restore_state", {
          score: savedUser.score,
          vrmUrl: savedUser.vrmUrl
        });
      } else if (userData.name) {
        persistedUsers.set(userData.name, {
          name: userData.name,
          score: userData.score || 0,
          vrmUrl: userData.vrmUrl
        });
        saveUsers();
      }

      activeUsers.set(userId, finalUserData);

      socket.emit("init_state", {
        users: Array.from(activeUsers.values()).filter((u: any) => u.roomId === roomId),
        crystals: Array.from(getCrystalsForRoom(roomId).values()),
        physicsProps: Array.from(getPropsForRoom(roomId).values()),
        sequencerGrid: getSequencerGridForRoom(roomId)
      });

      socket.to(roomId).emit("user_joined", finalUserData);
    });

    socket.on("join_room", (roomId) => {
      const userId = socket.data.userId || socket.id;
      if (!activeUsers.has(userId)) return;

      const user = activeUsers.get(userId);
      const oldRoom = user.roomId || DEFAULT_ROOM;
      
      socket.leave(oldRoom);
      socket.join(roomId);
      
      user.roomId = roomId;
      user.position = [0, 5, 0];
      activeUsers.set(userId, user);

      socket.to(oldRoom).emit("user_left", userId);
      socket.to(roomId).emit("user_joined", user);

      socket.emit("init_state", {
        users: Array.from(activeUsers.values()).filter((u: any) => u.roomId === roomId),
        crystals: Array.from(getCrystalsForRoom(roomId).values()),
        physicsProps: Array.from(getPropsForRoom(roomId).values()),
        sequencerGrid: getSequencerGridForRoom(roomId)
      });
    });

    socket.on("update_presence", (updates) => {
      const userId = socket.data.userId || socket.id;
      if (activeUsers.has(userId)) {
        const user = activeUsers.get(userId);
        
        if (updates.name && updates.name !== user.name) {
          if (persistedUsers.has(updates.name)) {
            const savedUser = persistedUsers.get(updates.name);
            updates.score = savedUser.score;
            updates.vrmUrl = savedUser.vrmUrl || user.vrmUrl;
            
            socket.emit("restore_state", {
              score: savedUser.score,
              vrmUrl: savedUser.vrmUrl
            });
          } else {
            persistedUsers.set(updates.name, {
              name: updates.name,
              score: user.score,
              vrmUrl: user.vrmUrl
            });
            saveUsers();
          }
        }
        
        const updatedUser = { ...user, ...updates };
        activeUsers.set(userId, updatedUser);
        
        if (updatedUser.name) {
          const savedData = persistedUsers.get(updatedUser.name) || {};
          let changed = false;
          
          if (updates.score !== undefined) {
            savedData.score = updates.score;
            changed = true;
          }
          if (updates.vrmUrl !== undefined) {
            savedData.vrmUrl = updates.vrmUrl;
            changed = true;
          }
          savedData.name = updatedUser.name;
          
          if (changed || !persistedUsers.has(updatedUser.name)) {
            persistedUsers.set(updatedUser.name, savedData);
            saveUsers();
          }
        }

        socket.to(updatedUser.roomId || DEFAULT_ROOM).emit("user_updated", updatedUser);
      }
    });

    socket.on("spawn_crystal", (crystalData) => {
      const userId = socket.data.userId || socket.id;
      const user = activeUsers.get(userId);
      const roomId = user?.roomId || DEFAULT_ROOM;
      const crystals = getCrystalsForRoom(roomId);
      crystals.set(crystalData.id, crystalData);
      io.to(roomId).emit("crystal_spawned", crystalData);
    });

    socket.on("spawn_prop", (propData) => {
      const userId = socket.data.userId || socket.id;
      const user = activeUsers.get(userId);
      const roomId = user?.roomId || DEFAULT_ROOM;
      const physicsProps = getPropsForRoom(roomId);
      physicsProps.set(propData.id, propData);
      io.to(roomId).emit("prop_spawned", propData);
    });

    socket.on("collect_crystal", (crystalId) => {
      const userId = socket.data.userId || socket.id;
      const user = activeUsers.get(userId);
      const roomId = user?.roomId || DEFAULT_ROOM;
      const crystals = getCrystalsForRoom(roomId);
      
      if (crystals.has(crystalId)) {
        crystals.delete(crystalId);
        io.to(roomId).emit("crystal_collected", crystalId);
        
        if (activeUsers.has(userId)) {
          user.score = (user.score || 0) + 1;
          activeUsers.set(userId, user);
          io.to(roomId).emit("user_updated", user);

          if (user.name) {
            const savedData = persistedUsers.get(user.name) || { name: user.name, vrmUrl: user.vrmUrl };
            savedData.score = user.score;
            persistedUsers.set(user.name, savedData);
            saveUsers();
          }
        }

        if (crystals.size < 15 && Math.random() < 0.5) {
          const id = `crystal-${roomId}-${Date.now()}`;
          const newCrystal = {
            id,
            position: [(Math.random() - 0.5) * 40, 1 + Math.random() * 3.5, (Math.random() - 0.5) * 40]
          };
          crystals.set(id, newCrystal);
          io.to(roomId).emit("crystal_spawned", newCrystal);
        }
      }
    });

    socket.on("bone_data", (data) => {
      const userId = socket.data.userId || socket.id;
      const user = activeUsers.get(userId);
      const roomId = user?.roomId || DEFAULT_ROOM;
      socket.to(roomId).emit("bone_data", { userId, data });
    });

    socket.on("npc_bone_data", (payload) => {
      const userId = socket.data.userId || socket.id;
      const user = activeUsers.get(userId);
      const roomId = user?.roomId || DEFAULT_ROOM;
      socket.to(roomId).emit("npc_bone_data", payload);
    });

    socket.on("chat_message", (payload) => {
      const userId = socket.data.userId || socket.id;
      const user = activeUsers.get(userId);
      const roomId = user?.roomId || DEFAULT_ROOM;
      socket.to(roomId).emit("chat_message", payload);
    });

    socket.on("npc_model_changed", (payload) => {
      const userId = socket.data.userId || socket.id;
      const user = activeUsers.get(userId);
      const roomId = user?.roomId || DEFAULT_ROOM;
      socket.to(roomId).emit("npc_model_changed", payload);
    });

    socket.on("sequencer_update", (payload) => {
      const userId = socket.data.userId || socket.id;
      const user = activeUsers.get(userId);
      if (user) {
        const roomId = user.roomId || DEFAULT_ROOM;
        const grid = getSequencerGridForRoom(roomId);
        if (grid[payload.track] && grid[payload.track][payload.step] !== undefined) {
          grid[payload.track][payload.step] = payload.value;
          io.to(roomId).emit("sequencer_update", payload);
        }
      }
    });

    socket.on("npc_modify_score", (payload: { targetUserName: string, pointsChange: number, reason: string }) => {
      let foundUser: any = null;
      let foundUserId: string | null = null;
      
      for (const [uid, user] of activeUsers.entries()) {
        if (user && user.name && user.name.toLowerCase() === payload.targetUserName.toLowerCase()) {
          foundUser = user;
          foundUserId = uid;
          break;
        }
      }
      
      const targetNameCase = foundUser ? foundUser.name : payload.targetUserName;
      const userRoomId = socket.data.roomId || DEFAULT_ROOM;
      console.log(`[NPCAccess-Score] Modifying score for: ${targetNameCase} by ${payload.pointsChange}. Reason: ${payload.reason}`);

      if (foundUser && foundUserId) {
        const newScore = Math.max(0, (foundUser.score || 0) + payload.pointsChange);
        foundUser.score = newScore;
        activeUsers.set(foundUserId, foundUser);
        
        // Save to persistent file
        const savedData = persistedUsers.get(foundUser.name) || { name: foundUser.name };
        savedData.score = newScore;
        persistedUsers.set(foundUser.name, savedData);
        saveUsers();
        
        // Emit update to everyone in the room
        io.to(foundUser.roomId || DEFAULT_ROOM).emit("user_updated", foundUser);
        
        // Notify the target user of their real-time state restoration
        const targetSocketId = foundUser.socketId || foundUserId;
        io.to(targetSocketId).emit("restore_state", {
          score: newScore,
          vrmUrl: foundUser.vrmUrl
        });
      } else {
        // Find in persisted users offline fallback
        for (const [name, pUser] of persistedUsers.entries()) {
          if (name.toLowerCase() === payload.targetUserName.toLowerCase()) {
            const newScore = Math.max(0, (pUser.score || 0) + payload.pointsChange);
            pUser.score = newScore;
            persistedUsers.set(name, pUser);
            saveUsers();
            break;
          }
        }
      }
      
      // Send a general system broadcast notification
      io.to(userRoomId).emit("chat_message", {
        id: `score_change_${Date.now()}`,
        senderName: "System Tether",
        text: `🏆 TRANSACTION: ${targetNameCase} score adjusted by ${payload.pointsChange > 0 ? '+' : ''}${payload.pointsChange} pts. (${payload.reason})`,
        timestamp: Date.now(),
        senderId: "system"
      });
    });

    socket.on("disconnect", () => {
      if (players[socket.id]) {
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
      }

      const userId = socket.data.userId || socket.id;
      const user = activeUsers.get(userId);
      if (user) {
         const roomId = user.roomId || DEFAULT_ROOM;
         io.to(roomId).emit("user_left", userId);
      }
      activeUsers.delete(userId);
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
