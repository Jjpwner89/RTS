const fs=require('fs'),http=require('http'),path=require('path');
const root=path.resolve(__dirname,'../../../..'),port=Number(process.env.PORT||8917),three=process.env.THREE_DIR;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.glb':'model/gltf-binary','.json':'application/json','.png':'image/png'};
http.createServer((req,res)=>{
 let uri=decodeURIComponent(new URL(req.url,'http://local').pathname),base=uri.startsWith('/__three__/')&&three?three:root;
 let rel=base===three?uri.slice('/__three__/'.length):uri.slice(1);if(!rel)rel='assets/art/3d/wip/review.html';
 const file=path.resolve(base,rel);if(!file.startsWith(path.resolve(base)+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);res.end('Not found');return;}
 if(three&&file.endsWith('.html'))data=Buffer.from(data.toString().replaceAll('https://cdn.jsdelivr.net/npm/three@0.170.0/','/__three__/'));
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);
 });
}).listen(port,'127.0.0.1',()=>console.log('Animation review: http://127.0.0.1:'+port+'/assets/art/3d/wip/review.html'));
