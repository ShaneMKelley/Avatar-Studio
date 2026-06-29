import { io } from "socket.io-client";
const socket = io("http://localhost:3000", { transports: ['websocket'] });
socket.on("connect", () => {
  console.log("Connected successfully!");
  process.exit(0);
});
socket.on("connect_error", (err) => {
  console.error("Connect error:", err);
  process.exit(1);
});
setTimeout(() => {
  console.error("Timeout!");
  process.exit(1);
}, 2000);
