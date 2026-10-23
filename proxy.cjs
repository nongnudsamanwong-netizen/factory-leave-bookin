const http=require('http');
http.createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  const path=req.url.replace(/^\/rest\/v1/,'');
  const p=http.request({host:'localhost',port:3001,path,method:req.method,headers:{...req.headers,host:'localhost:3001'}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
  req.pipe(p); p.on('error',e=>{res.writeHead(502);res.end(String(e));});
}).listen(5174);
