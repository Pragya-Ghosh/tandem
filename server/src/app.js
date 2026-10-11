const express = require('express');
const http = require('http');
const cors = require('cors');

const DocumentManager = require('../db/DocumentManager');

function createApp() {
  const app = express();
  
  app.use(cors());
  
  // required to read the JSON body in POST requests
  app.use(express.json());

  // Healthcheck route
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 1. GET: List all files
  app.get('/api/files', (req, res) => {
    try {
      const files = DocumentManager.listFiles();
      res.json(files);
    } catch (err) {
      console.error('[API] Failed to list files:', err);
      res.status(500).json({ error: 'Could not list files.' });
    }
  });

  // 2. POST: Create a new file
  app.post('/api/files', (req, res) => {
    try {
      if (!req.body || !req.body.name) {
        return res.status(400).json({ error: 'A file name is required.' });
      }

      const result = DocumentManager.createFile(req.body.name);

      if (result.success) {
        res.json(result.file);
      } else {
        res.status(result.status || 400).json({ error: result.reason });
      }
    } catch (err) {
      console.error('[API] Failed to create file:', err);
      res.status(500).json({ error: 'Could not create file.' });
    }
  });

  // 3. DELETE: Remove a file
  app.delete('/api/files/:id', (req, res) => {
    try {
      const result = DocumentManager.deleteFile(req.params.id);
      
      if (result.success) {
        res.status(204).send(); // 204 No Content = Success
      } else {
        res.status(result.status || 400).json({ error: result.reason });
      }
    } catch (err) {
      console.error('[API] Failed to delete file:', err);
      res.status(500).json({ error: 'Could not delete file.' });
    }
  });

  const server = http.createServer(app);
  return { app, server };
}

module.exports = createApp;