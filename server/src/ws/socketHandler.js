const WebSocket = require('ws');
const { WS_EVENTS } = require('../constants/events');

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

function handleMessage(ws, wss, message, documentStore) {
  const { type, data } = message || {};
  if (!data || typeof data !== 'object') return;

  switch (type) {
    case WS_EVENTS.EDIT_LINE: {
      const { lineIndex, baseVersion, newContent } = data;
      const result = documentStore.applyEdit(lineIndex, baseVersion, newContent);

      if (result.success) {
        console.log(`[Edit Accepted] Line ${lineIndex} updated to v${result.line.version}`);
        broadcast(wss, { type: WS_EVENTS.LINE_UPDATED, data: result.line });
      } else if (result.line) {
        // Version conflict: tell the sender what the line really looks like.
        console.log(`[Edit Rejected] Stale write on Line ${lineIndex}`);
        sendJson(ws, {
          type: WS_EVENTS.EDIT_REJECTED,
          data: { lineIndex, authoritativeLine: result.line, reason: result.reason },
        });
      } else {
        // Missing line or invalid input: there's no line to send back, so resync.
        console.log(`[Edit Ignored] ${result.reason}`);
        sendSnapshot(ws, documentStore);
      }
      break;
    }

    // Structural addition of lines (Enter key)
    case WS_EVENTS.ADD_LINE: {
      const { afterIndex, id } = data;
      const result = documentStore.addLine(afterIndex, id);

      if (result.success) {
        console.log(`[Line Added] After line ${afterIndex}`);
        broadcast(wss, { type: WS_EVENTS.LINE_ADDED, data: result.snapshot });
      } else {
        console.log(`[Add Ignored] ${result.reason}`);
        sendSnapshot(ws, documentStore);
      }
      break;
    }

    // Structural removal of lines (Backspace/Delete)
    case WS_EVENTS.REMOVE_LINE: {
      const { index } = data;
      const result = documentStore.removeLine(index);

      if (result.success) {
        console.log(`[Line Removed] Line ${index}`);
        broadcast(wss, { type: WS_EVENTS.LINE_REMOVED, data: result.snapshot });
      } else {
        // The client already removed the line on screen: put it back right away.
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
  sendJson(ws, { type: WS_EVENTS.INIT, data: documentStore.getSnapshot() });
}

function broadcast(wss, payload) {
  wss.clients.forEach((client) => {
    sendJson(client, payload);
  });
}

module.exports = setupWebSocketServer;