const createApp = require('./src/app');
const DocumentStore = require('./src/services/documentStore');
const setupWebSocketServer = require('./src/ws/socketHandler');

const PORT = process.env.PORT || 5000;

// Initialize dependencies
const { server } = createApp();
const documentStore = new DocumentStore();

// Attach WS transport
setupWebSocketServer(server, documentStore);

server.listen(PORT, () => {
  console.log(`> Tandem Engine running on port ${PORT}`);
});