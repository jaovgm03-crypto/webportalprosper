// Local-only harness; never part of dist or a Vercel deployment.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');let rel;
  if(req.method==='POST'&&url.pathname==='/test-result'){
    if(req.headers.origin!=='http://127.0.0.1:8083'){res.writeHead(403).end();return;}
    let body='',size=0;req.on('data',chunk=>{size+=chunk.length;if(size>65536)req.destroy();else body+=chunk;});
    req.on('end',()=>{try{const result=JSON.parse(body);fs.mkdirSync(path.join(root,'tmp'),{recursive:true});fs.writeFileSync(path.join(root,'tmp/browser-test-result.json'),JSON.stringify(result,null,2));res.writeHead(204).end();}catch{res.writeHead(400).end();}});return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  try{rel=decodeURIComponent(url.pathname).replace(/^\//,'');}catch{res.writeHead(400).end();return;}
  if(!/^(dist\/|tmp\/files-tests\/|scripts\/files-browser-tests\.(html|mjs)$)/.test(rel)){res.writeHead(404).end();return;}
  const file=path.resolve(root,rel);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data);});
}).listen(8083,'127.0.0.1',()=>console.log('Testes: http://127.0.0.1:8083/scripts/files-browser-tests.html'));
