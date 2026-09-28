const express = require('express');
const http = require('http');
const cors = require('cors');

function createApp() {
  const app = express();
  app.use(cors());

  // Healthcheck route
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const server = http.createServer(app);
  return { app, server };
}

module.exports = createApp;