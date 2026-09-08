import http from 'node:http';
import { readFile } from 'node:fs/promises';
const allowed = {'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js','/simulation.js':'simulation.js'};
http.createServer(async(req,res)=>{const file=allowed[new URL(req.url,'http://localhost').pathname];if(!file){res.writeHead(404);res.end();return;}try{const data=await readFile(new URL(`./site/${file}`,import.meta.url));res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');res.end(data);}catch{res.writeHead(500);res.end();}}).listen(4173,'0.0.0.0',()=>console.log('http://localhost:4173'));
