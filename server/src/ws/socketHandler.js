const WebSocket = require('ws');
const { WS_EVENTS } = require('../constants/events');

/** Wire protocol version: 2 = every operation addresses a line by id. */
const PROTOCOL_VERSION = 2;

function setupWebSocketServer(server, documentStore) {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    console.log('[+] Client connected');

    // Send authoritative snapshot upon connection
    sendSnapshot(ws, documentStore);

    // Message router
    ws.on('message', (rawMessage) => {
      let message;
      try {
        message = JSON.parse(rawMessage);
      } catch (err) {
        console.error('[-] Invalid JSON received:', err.message);
        return;
      }

      try {
        handleMessage(ws, wss, message, documentStore);
      } catch (err) {
        // A bad payload must never take the server down or be mistaken for bad JSON.
        console.error('[-] Failed to handle message:', err);
      }
    });

    ws.on('close', () => {
      console.log('[-] Client disconnected');
    });
  });

  return wss;
}

/**
 * Every operation addresses a line by its id (never by line number).
 * Messages from one client are processed in the order they were sent.
 */
function handleMessage(ws, wss, message, documentStore) {
  const { type, data } = message || {};
  if (!data || typeof data !== 'object') return;

  // FIX: The client sends lowercase event types (e.g., "edit_line"), 
  // but WS_EVENTS constants are likely uppercase (e.g., "EDIT_LINE").
  // Normalizing both to uppercase ensures the router never misses a message.
  const action = String(type).toUpperCase();
  const EV_EDIT = String(WS_EVENTS.EDIT_LINE || 'EDIT_LINE').toUpperCase();
  const EV_ADD = String(WS_EVENTS.ADD_LINE || 'ADD_LINE').toUpperCase();
  const EV_REMOVE = String(WS_EVENTS.REMOVE_LINE || 'REMOVE_LINE').toUpperCase();

  switch (action) {
    case EV_EDIT: {
      const { lineId, baseVersion, newContent } = data;
      const result = documentStore.applyEdit(lineId, baseVersion, newContent);

      if (result.success) {
        console.log(`[Edit Accepted] Line ${result.line.index} updated to v${result.line.version}`);
        broadcast(wss, { type: WS_EVENTS.LINE_UPDATED, data: result.line });
      } else if (result.line) {
        // Version conflict: tell the sender what the line really looks like.
        console.log(`[Edit Rejected] Stale write on Line ${result.line.index}`);
        sendJson(ws, {
          type: WS_EVENTS.EDIT_REJECTED,
          data: {
            lineId,
            lineIndex: result.line.index,
            authoritativeLine: result.line,
            reason: result.reason,
          },
        });
      } else {
        // Missing line or invalid input: there's no line to send back, so resync.
        console.log(`[Edit Ignored] ${result.reason}`);
        sendSnapshot(ws, documentStore);
      }
      break;
    }

    // Structural addition of lines (Enter key)
    case EV_ADD: {
      const { afterId, id } = data;
      const result = documentStore.addLine(afterId, id);

      if (result.success) {
        console.log(`[Line Added] After line ${afterId}`);
        broadcast(wss, { type: WS_EVENTS.LINE_ADDED, data: result.snapshot });
      } else {
        console.log(`[Add Ignored] ${result.reason}`);
        sendSnapshot(ws, documentStore);
      }
      break;
    }

    // Structural removal of lines (Backspace/Delete)
    case EV_REMOVE: {
      const { lineId } = data;
      const result = documentStore.removeLine(lineId);

      if (result.success) {
        console.log(`[Line Removed] Line ${lineId}`);
        broadcast(wss, { type: WS_EVENTS.LINE_REMOVED, data: result.snapshot });
      } else {
        // The client already removed the line on screen: resync it right away.
        console.log(`[Remove Ignored] ${result.reason}`);
        sendSnapshot(ws, documentStore);
      }
      break;
    }
  }
}

// Helpers
function sendJson(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

/** Sends the full document to one client (initial load and resyncs). */
function sendSnapshot(ws, documentStore) {
  sendJson(ws, {
    type: WS_EVENTS.INIT,
    protocol: PROTOCOL_VERSION,
    data: documentStore.getSnapshot(),
  });
}

function broadcast(wss, payload) {
  wss.clients.forEach((client) => {
    sendJson(client, payload);
  });
}

module.exports = setupWebSocketServer;