const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 8082);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.geojson':'application/geo+json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.csv':'text/csv; charset=utf-8','.bin':'application/octet-stream'};
function serve(req, res) {
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405,{'Allow':'GET, HEAD'}).end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname); }
  catch { res.writeHead(400).end(); return; }
  const file = path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if (!file.startsWith(root+path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file,(err,stat)=>{
    if(err||!stat.isFile()){res.writeHead(404).end('Arquivo não encontrado');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD') res.end();
    else {
      const stream=fs.createReadStream(file);
      stream.on('error',()=>res.destroy());
      res.on('close',()=>stream.destroy());
      stream.pipe(res);
    }
  });
}
// Bind loopback and private LAN interfaces only.
const isPrivate = ip => { const p=ip.split('.').map(Number); return p[0]===10 || (p[0]===192&&p[1]===168) || (p[0]===172&&p[1]>=16&&p[1]<=31); };
const addresses = ['127.0.0.1'];
for(const address of addresses) {
  http.createServer(serve).on('error',err=>console.error(`Não foi possível abrir ${address}:${port}: ${err.message}`)).listen(port,address,()=>console.log(`WebGIS Prosper 1.2: http://${address}:${port}/`));
}
