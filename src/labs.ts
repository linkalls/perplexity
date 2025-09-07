//  perplexity.labs.LabsClient
// Implements Socket.IO handshake via polling to obtain SID, then connects to WebSocket.

export class LabsClient {
  base = 'https://www.perplexity.ai';
  timestamp: string;
  sid: string | null = null;
  ws: WebSocket | null = null;
  last_answer: any = null;
  history: any[] = [];

  constructor(){
    this.timestamp = Math.floor(Math.random()*0xffffffff).toString(16).padStart(8, '0');
  }

  async init(): Promise<this>{
    // polling to get sid 
    const resp = await fetch(`${this.base}/socket.io/?EIO=4&transport=polling&t=${this.timestamp}`);
    const text = await resp.text();
    // server returns something like: 96:0{"sid":"...",...}
    const jsonStart = text.indexOf('{');
    if (jsonStart === -1) throw new Error('failed to parse polling response');
    const payload = JSON.parse(text.slice(jsonStart));
    this.sid = payload.sid;

    // perform the second POST to confirm 
    await fetch(`${this.base}/socket.io/?EIO=4&transport=polling&t=${this.timestamp}&sid=${this.sid}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '40{"jwt":"anonymous-ask-user"}'
    });

    // connect websocket
    const wsUrl = `wss://www.perplexity.ai/socket.io/?EIO=4&transport=websocket&sid=${this.sid}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      // Socket.IO probe
      try{ this.ws?.send('2probe'); }catch(e){}
      try{ this.ws?.send('5'); }catch(e){}
    };

    this.ws.onmessage = (ev) => {
      const data = typeof ev.data === 'string' ? ev.data : '';
      if (data === '2') { try{ this.ws?.send('3'); }catch(e){} }
      if (data.startsWith('42')){
        try{
          const parsed = JSON.parse(data.slice(2));
          const resp = parsed[1];
          this.last_answer = resp;
        }catch(e){}
      }
    };

    // wait until ws is open
    await new Promise<void>((resolve)=>{
      const t = setInterval(()=>{
        if (this.ws && this.ws.readyState === WebSocket.OPEN){ clearInterval(t); resolve(); }
      }, 20);
    });

    return this;
  }

  async ask(query: string, model = 'r1-1776', stream = false): Promise<any | AsyncGenerator<any, void, void>>{
    if (!this.ws) throw new Error('not initialized');
    if (!['r1-1776','sonar-pro','sonar','sonar-reasoning-pro','sonar-reasoning'].includes(model)) throw new Error('invalid model');

    this.last_answer = null;
    this.history.push({ role: 'user', content: query });

    const payload = ['perplexity_labs', { messages: this.history, model, source: 'default', version: '2.18' }];
    this.ws.send('42' + JSON.stringify(payload));

    if (stream){
      const self = this;
      return (async function*(){
        let prev: any = null;
        while (true){
          if (self.last_answer !== prev){
            prev = self.last_answer;
            yield prev;
          }
          if (self.last_answer && self.last_answer.final){
            const answer = self.last_answer;
            self.last_answer = null;
            self.history.push({ role: 'assistant', content: answer.output, priority: 0 });
            return;
          }
          await new Promise(r=>setTimeout(r, 10));
        }
      })();
    }

    // non-stream: wait until final
    while (true){
      if (this.last_answer && this.last_answer.final){
        const answer = this.last_answer;
        this.last_answer = null;
        this.history.push({ role: 'assistant', content: answer.output, priority: 0 });
        return answer;
      }
      await new Promise(r=>setTimeout(r, 10));
    }
  }
}

export default LabsClient;
