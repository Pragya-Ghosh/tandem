const createApp = require('./src/app');
const setupWebSocketServer = require('./src/ws/socketHandler');

const PORT = process.env.PORT || 5000;

// Initialize dependencies
const { server } = createApp();

// Attach WS transport (socketHandler handles DocumentManager dynamically per room)
setupWebSocketServer(server);

server.listen(PORT, () => {
  console.log(`> Tandem Engine running on port ${PORT}`);
});