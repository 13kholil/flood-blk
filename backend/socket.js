const { Server } = require('socket.io');

let io;

function initSocket(server) {
  const corsOrigin = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'];
  io = new Server(server, {
    cors: { origin: corsOrigin, credentials: true },
    pingInterval: 25000,
    pingTimeout: 20000,
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id} (${socket.handshake.address})`);

    socket.on('subscribe:updates', () => {
      socket.join('updates');
    });

    socket.on('unsubscribe:updates', () => {
      socket.leave('updates');
    });

    socket.on('disconnect', (reason) => {
      console.log(`🔌 Client disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

function broadcastNewReport(report) {
  if (io) io.emit('new_report', report);
}

function broadcastUpdate(report) {
  if (io) io.emit('report_update', report);
}

module.exports = { initSocket, getIO, broadcastNewReport, broadcastUpdate };
