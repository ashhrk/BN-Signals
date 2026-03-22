// src/dashboard-server.js
// Serves the dashboard HTML + pushes live signals via WebSocket

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function startDashboardServer(port = 3000) {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  // Serve dashboard HTML
  app.get('/', (req, res) => {
    const htmlPath = join(__dirname, '..', 'dashboard.html');
    if (existsSync(htmlPath)) {
      res.sendFile(htmlPath);
    } else {
      res.status(404).send('dashboard.html not found');
    }
  });

  // REST: last 50 signals from today's log
  app.get('/api/signals', (req, res) => {
    try {
      const date = new Date().toISOString().split('T')[0];
      const logPath = join(__dirname, '..', 'logs', `signals-${date}.jsonl`);
      if (!existsSync(logPath)) return res.json([]);

      const lines = readFileSync(logPath, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .slice(-50)
        .reverse();

      res.json(lines);
    } catch (e) {
      res.json([]);
    }
  });

  // WebSocket: broadcast new signals to all connected clients
  const broadcast = (data) => {
    const msg = JSON.stringify(data);
    wss.clients.forEach((client) => {
      if (client.readyState === 1) client.send(msg);
    });
  };

  wss.on('connection', (ws) => {
    console.log('[Dashboard] Client connected');
    ws.on('close', () => console.log('[Dashboard] Client disconnected'));
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[Dashboard] Running at http://0.0.0.0:${port}`);
  });

  return { broadcast };
}
