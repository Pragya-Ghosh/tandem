const WebSocket = require('ws');
const { WS_EVENTS } = require('../constants/events');
const DocumentManager = require('../../db/DocumentManager'); 

/** Wire protocol version: 2 = every operation addresses a line by id. */
const PROTOCOL_VERSION = 2;

function setupWebSocketServer(server) {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws, req) => {
    // 1. Extract fileId from URL query params
    let fileId = 'default';
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      fileId = url.searchParams.get('fileId') || 'default';
    } catch (err) {
      console.warn('[-] Could not parse URL query params, defaulting to "default"');
    }

    // 2. Validate fileId using DocumentManager's security rules
    if (!DocumentManager.isValidFileId(fileId)) {
      console.warn(`[-] Connection rejected: Invalid fileId "${fileId}"`);
      ws.close(4000, 'Invalid file id');
      return;
    }

    // Tag socket with its room fileId
    ws.fileId = fileId;
    console.log(`[+] Client connected to room: ${fileId}`);

    // Get the specific document store for this room
    const documentStore = DocumentManager.getDocument(fileId);

    // Send authoritative snapshot upon connection
    sendSnapshot(ws, documentStore, fileId);

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
        handleMessage(ws, wss, message, fileId);
      } catch (err) {
        console.error('[-] Failed to handle message:', err);
      }
    });

    ws.on('close', () => {
      console.log(`[-] Client disconnected from room: ${fileId}`);
    });
  });

  return wss;
}

/**
 * Every operation addresses a line by its id (never by line number).
 * Messages from one client are processed in the order they were sent.
 */
function handleMessage(ws, wss, message, fileId) {
  const { type, data } = message || {};
  const action = String(type).toUpperCase();
  
  const EV_SAVE = String(WS_EVENTS.SAVE || 'SAVE').toUpperCase();
  const EV_EDIT = String(WS_EVENTS.EDIT_LINE || 'EDIT_LINE').toUpperCase();
  const EV_ADD = String(WS_EVENTS.ADD_LINE || 'ADD_LINE').toUpperCase();
  const EV_REMOVE = String(WS_EVENTS.REMOVE_LINE || 'REMOVE_LINE').toUpperCase();

  const documentStore = DocumentManager.getDocument(fileId);

  switch (action) {
    // --------------------------------------------------------
    // MANUAL SAVE TRIGGER (Ctrl + S)
    // --------------------------------------------------------
    case EV_SAVE: {
      const result = DocumentManager.saveDocument(fileId);
      if (result.success) {
        console.log(`[Save] Manual save successful for ${fileId}`);
        sendJson(ws, { 
          type: WS_EVENTS.SAVE_ACK, 
          data: { savedAt: result.savedAt } 
        });
      } else {
        sendJson(ws, { 
          type: WS_EVENTS.SAVE_ERROR, 
          data: { reason: result.reason } 
        });
      }
      break;
    }

    // --------------------------------------------------------
    // LINE EDIT
    // --------------------------------------------------------
    case EV_EDIT: {
      if (!data || typeof data !== 'object') return;
      const { lineId, baseVersion, newContent } = data;
      const result = documentStore.applyEdit(lineId, baseVersion, newContent);

      if (result.success) {
        DocumentManager.markDirty(fileId);
        console.log(`[Edit Accepted] ${fileId} - Line ${result.line.index} updated to v${result.line.version}`);
        broadcastToRoom(wss, fileId, { type: WS_EVENTS.LINE_UPDATED, data: result.line });
      } else if (result.line) {
        console.log(`[Edit Rejected] Stale write on ${fileId} Line ${result.line.index}`);
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
        console.log(`[Edit Ignored] ${result.reason}`);
        sendSnapshot(ws, documentStore, fileId);
      }
      break;
    }

    // --------------------------------------------------------
    // LINE ADD (Enter key)
    // --------------------------------------------------------
    case EV_ADD: {
      if (!data || typeof data !== 'object') return;
      const { afterId, id } = data;
      const result = documentStore.addLine(afterId, id);

      if (result.success) {
        DocumentManager.markDirty(fileId);
        console.log(`[Line Added] ${fileId} - After line ${afterId}`);
        broadcastToRoom(wss, fileId, { type: WS_EVENTS.LINE_ADDED, data: result.snapshot });
      } else {
        console.log(`[Add Ignored] ${result.reason}`);
        sendSnapshot(ws, documentStore, fileId);
      }
      break;
    }

    // --------------------------------------------------------
    // LINE REMOVE (Backspace/Delete)
    // --------------------------------------------------------
    case EV_REMOVE: {
      if (!data || typeof data !== 'object') return;
      const { lineId } = data;
      const result = documentStore.removeLine(lineId);

      if (result.success) {
        DocumentManager.markDirty(fileId);
        console.log(`[Line Removed] ${fileId} - Line ${lineId}`);
        broadcastToRoom(wss, fileId, { type: WS_EVENTS.LINE_REMOVED, data: result.snapshot });
      } else {
        console.log(`[Remove Ignored] ${result.reason}`);
        sendSnapshot(ws, documentStore, fileId);
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

/** Sends the full document and its save status to one client. */
function sendSnapshot(ws, documentStore, fileId) {
  const status = DocumentManager.getStatus(fileId);
  sendJson(ws, {
    type: WS_EVENTS.INIT,
    protocol: PROTOCOL_VERSION,
    data: documentStore.getSnapshot(),
    status,
  });
}

/** Broadcasts ONLY to clients connected to the same file room. */
function broadcastToRoom(wss, fileId, payload) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.fileId === fileId) {
      sendJson(client, payload);
    }
  });
}

module.exports = setupWebSocketServer;