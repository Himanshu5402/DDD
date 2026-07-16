import { Server } from 'socket.io';
import logger from '../config/logger.js';
import { corsOrigin } from '../config/cors.js';
import { verifyAccessToken } from '../services/token.service.js';

let io = null;

/**
 * Initialize the Socket.IO server on top of the HTTP server. Connections must
 * authenticate with a JWT access token (handshake auth.token or ?token=).
 * Each user joins a private room `user:<id>` for targeted notifications.
 */
export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = verifyAccessToken(token);
      socket.userId = payload.sub;
      return next();
    } catch {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);
    logger.debug(`Socket connected: ${socket.id} (user ${socket.userId})`);

    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.id}`);
    });
  });

  logger.info('Socket.IO initialized');
  return io;
}

export function getIO() {
  return io;
}

/** Emit an event to a specific user's room. */
export function emitToUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}

/** Broadcast an event to all connected clients. */
export function broadcast(event, payload) {
  io?.emit(event, payload);
}
