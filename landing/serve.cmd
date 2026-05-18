@echo off
SET PATH=C:\Program Files\nodejs;%PATH%
cd /d D:\FlutterApp\landing
"C:\Program Files\nodejs\node.exe" -e "const h=require('http'),fs=require('fs'),p=require('path');h.createServer((req,res)=>{const f=p.join('D:\\FlutterApp\\landing',req.url==='/'?'index.html':req.url);fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();}else{const ext=p.extname(f);const ct={'html':'text/html','css':'text/css','js':'text/javascript','png':'image/png'}[ext.slice(1)]||'text/plain';res.writeHead(200,{'Content-Type':ct});res.end(d);}});}).listen(8080,()=>console.log('Landing at http://localhost:8080'));"
