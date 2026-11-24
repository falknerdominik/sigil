#!/usr/bin/env node
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.md':'text/plain; charset=utf-8'};
const port = Number(process.env.PORT || 4173);
http.createServer((req,res) => {
  let requested;
  try { requested = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  if (requested === '/') { res.writeHead(302,{Location:'/src/index.html'}).end(); return; }
  const absolute = path.resolve(root, '.' + requested);
  if (!absolute.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(absolute, (error,stat) => {
    if (error || !stat.isFile()) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200,{'Content-Type':types[path.extname(absolute)] || 'application/octet-stream','Cache-Control':'no-cache'});
    fs.createReadStream(absolute).pipe(res);
  });
}).listen(port,'0.0.0.0',()=>console.log(`Sigil development preview: http://localhost:${port}/`));
