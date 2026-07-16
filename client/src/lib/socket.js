import { io } from 'socket.io-client';
import { SOCKET_URL } from '../config/env.js';
import { tokenStore } from './tokenStore.js';

let socket = null;

/** Connect (or reconnect) the authenticated socket using the current token. */
export function connectSocket() {
  const token = tokenStore.getAccess();
  if (!token) return null;
  if (socket) socket.disconnect();

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
  });
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
