const express = require('express');
const http = require('http');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

function createApp() {
  const app = express();
  app.use(cors());

  // Healthcheck route
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API to list all saved files on the server
  app.get('/api/files', (req, res) => {
    // Assuming your data folder is at the root level like: /db/data 
    // Since app.js is in /src, we go up one level with '..'
    const dataDir = path.join(__dirname, '../db/data'); 
    
    if (!fs.existsSync(dataDir)) {
      return res.json([]);
    }

    fs.readdir(dataDir, (err, files) => {
      if (err) return res.status(500).json([]);
      
      const fileList = files
        .filter(f => !f.startsWith('.')) // Ignore .gitkeep or hidden files
        .map(f => {
          const id = path.parse(f).name; 
          return {
            id: id,
            name: id,
            updatedAt: fs.statSync(path.join(dataDir, f)).mtimeMs
          };
        })
        .sort((a, b) => b.updatedAt - a.updatedAt); // Newest files first
        
      res.json(fileList);
    });
  });

  const server = http.createServer(app);
  return { app, server };
}

module.exports = createApp;