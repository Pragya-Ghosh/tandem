const WebSocket = require('ws');
const { WS_EVENTS } = require('../constants/events');

function setupWebSocketServer(server, documentStore) {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    console.log('[+] Client connected');

    // Send authoritative snapshot upon connection
    sendJson(ws, {
      type: WS_EVENTS.INIT,
      data: documentStore.getSnapshot(),
    });

    // Message router
    ws.on('message', (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage);
        handleMessage(ws, wss, message, documentStore);
      } catch (err) {
        console.error('[-] Invalid JSON received:', err.message);
      }
    });

    ws.on('close', () => {
      console.log('[-] Client disconnected');
    });
  });

  return wss;
}

function handleMessage(ws, wss, message, documentStore) {
  const { type, data } = message;

  if (type === WS_EVENTS.EDIT_LINE) {
    const { lineIndex, baseVersion, newContent } = data;
    const result = documentStore.applyEdit(lineIndex, baseVersion, newContent);

    if (result.success) {
      console.log(`[Edit Accepted] Line ${lineIndex} updated to v${result.line.version}`);
      broadcast(wss, {
        type: WS_EVENTS.LINE_UPDATED,
        data: result.line,
      });
    } else {
      console.log(`[Edit Rejected] Stale write on Line ${lineIndex}`);
      sendJson(ws, {
        type: WS_EVENTS.EDIT_REJECTED,
        data: {
          lineIndex,
          authoritativeLine: result.line,
          reason: result.reason,
        },
      });
    }
  }

  // Handle structural addition of lines (Enter key)
  if (type === WS_EVENTS.ADD_LINE) {
    const { afterIndex, id } = data; // <-- Extract the ID here!
    const result = documentStore.addLine(afterIndex, id);

    if (result && result.success) {
      console.log(`[Line Added] After line ${afterIndex}`);
      broadcast(wss, {
        type: WS_EVENTS.LINE_ADDED,
        data: result.snapshot,
      });
    }
  }

  // Handle structural removal of lines (Backspace/Delete)
  if (type === WS_EVENTS.REMOVE_LINE) {
    const { index } = data;
    const result = documentStore.removeLine(index);

    if (result && result.success) {
      console.log(`[Line Removed] Line ${index}`);
      broadcast(wss, {
        type: WS_EVENTS.LINE_REMOVED,
        data: result.snapshot,
      });
    }
  }
}

// Helpers
function sendJson(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(wss, payload) {
  wss.clients.forEach((client) => {
    sendJson(client, payload);
  });
}

module.exports = setupWebSocketServer;