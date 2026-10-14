// CDP helper: navigate + evaluate + wait
const http = require('http');
const WebSocket = require('ws');
function getJSON(url){return new Promise((res,rej)=>{http.get(url,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on('error',rej)})}

class CDP {
  constructor(ws){this.ws=ws;this.id=0;this.pending=new Map();
    ws.on('message',d=>{const m=JSON.parse(d);if(m.id&&this.pending.has(m.id)){const p=this.pending.get(m.id);this.pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result)}});
  }
  static async connect(){
    const targets=await getJSON('http://127.0.0.1:9333/json');
    const page=targets.find(t=>t.type==='page');
    const ws=new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{ws.on('open',res);ws.on('error',rej)});
    return new CDP(ws);
  }
  send(method,params={}){return new Promise((resolve,reject)=>{const i=++this.id;this.pending.set(i,{resolve,reject});this.ws.send(JSON.stringify({id:i,method,params}))})}
  async eval(expression,awaitPromise=false){
    const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise});
    if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
    return r.result.value;
  }
  async goto(path){
    await this.eval(`location.href=${JSON.stringify(path)}`);
    await this.wait(2500);
  }
  wait(ms){return new Promise(r=>setTimeout(r,ms))}
  close(){this.ws.close()}
}

module.exports={CDP};
