const { Server } = require('socket.io');

let io;

function initSocket(server) {
  const corsOrigin = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'];
  io = new Server(server, { cors: { origin: corsOrigin, credentials: true } });
  io.on('connection', (socket) => console.log('Client connected:', socket.id));
  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

function broadcastNewReport(report) {
  if (io) io.emit('new_report', report);
}

module.exports = { initSocket, getIO, broadcastNewReport };
