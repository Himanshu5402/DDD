import { io } from 'socket.io-client';
import { SOCKET_URL } from '../config/env.js';
import { tokenStore } from './tokenStore.js';
import api from './axios.js';

let socket = null;
let unsubscribe = null;

/**
 * Connect (or reuse) the authenticated socket.
 *
 * The access token is read *at every (re)connect* via the callback form of
 * `auth`, so a token rotated by the axios refresh interceptor is always picked
 * up. The instance is kept stable across reconnects (listeners bound via
 * getSocket() survive), and only torn down on logout.
 */
export function connectSocket() {
  if (!tokenStore.getAccess()) return null;

  if (socket) {
    if (!socket.connected) socket.connect();
    return socket;
  }

  socket = io(SOCKET_URL, {
    // Callback form → evaluated on each handshake with the current token.
    auth: (cb) => cb({ token: tokenStore.getAccess() }),
    transports: ['websocket'],
    autoConnect: true,
  });

  // A server-side auth rejection (e.g. an expired access token) is a fatal
  // handshake error: socket.io sets `active = false` and will NOT retry on its
  // own. Refresh the token via the API (which runs the axios refresh flow) and
  // reconnect. Transient/network errors keep `active = true` and self-retry, so
  // we leave those alone.
  socket.on('connect_error', () => {
    if (!socket || socket.active) return;
    api
      .get('/auth/me')
      .then(() => {
        if (socket && !socket.connected) socket.connect();
      })
      .catch(() => {
        /* refresh failed → SESSION_EXPIRED tears the session (and socket) down */
      });
  });

  // When the token rotates (refresh or a fresh login), reconnect a dropped
  // socket so realtime heals without waiting for the next user action.
  unsubscribe = tokenStore.subscribe(() => {
    if (socket && !socket.connected && tokenStore.getAccess()) socket.connect();
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
