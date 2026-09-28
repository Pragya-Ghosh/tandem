const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

//array of versioned lines
let documentState = [
    { index: 0, version: 1, content: "function initialize() {" },
    { index: 1, version: 1, content: "  console.log('Tandem is live!');" },
    { index: 2, version: 1, content: "}" },
];

//handshake
wss.on('connection', (ws) => {
    console.log('[+] New client connected');

    //send initial array state to the new client
    ws.send(JSON.stringify({ type: 'init', data: documentState }));

    //parsing incoming edits
    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            
            //handle line-specific edits
            if (parsedMessage.type === 'edit_line') {
                const { lineIndex, baseVersion, newContent } = parsedMessage.data;
                const serverLine = documentState[lineIndex];

                if (!serverLine) return; // Ignore if line doesn't exist


                /* --- OCC LOGIC --- */

                // ACCEPTED: The client's version matches the server's
                if (baseVersion === serverLine.version) {
                    serverLine.content = newContent;
                    serverLine.version += 1;

                    console.log(`[Edit Accepted] Line ${lineIndex} updated to v${serverLine.version}`);

                    //broadcast the successful edit to all connected clients
                    wss.clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ 
                                type: 'line_updated', 
                                data: serverLine 
                            }));
                        }
                    });
                } 

                // REJECTED: The client edited a stale version
                else {
                    console.log(`[Edit Rejected] Stale write on Line ${lineIndex}`);

                    //send the authoritative line only to the client who got rejected
                    ws.send(JSON.stringify({ 
                        type: 'edit_rejected', 
                        data: { 
                            lineIndex: lineIndex, 
                            authoritativeLine: serverLine,
                            reason: "OCC Conflict: Someone else edited this line first."
                        } 
                    }));
                }
            }
        } 
        
        catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    ws.on('close', () => {
        console.log('[-] Client disconnected');
    });
});

const PORT = 5000;
server.listen(PORT, () => {
    console.log(`> Tandem OCC Server listening on port ${PORT}`);
});