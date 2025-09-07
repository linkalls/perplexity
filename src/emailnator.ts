export class Emailnator {
  public email: string = '';
  private headers: Record<string,string>;
  private cookies: Record<string,string>;
  public inbox: any[] = [];
  public inbox_ads: string[] = [];

  constructor(cookies: Record<string,string> = {}, headers: Record<string,string> = {}){
    this.cookies = cookies || {};
    const defaultHeaders: Record<string,string> = {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'en-US,en;q=0.9',
      'content-type': 'application/json',
      'dnt': '1',
      'origin': 'https://www.emailnator.com',
      'referer': 'https://www.emailnator.com/',
      'user-agent': 'bun-emailnator-client/0.1',
      'x-requested-with': 'XMLHttpRequest'
    };

    if (cookies['XSRF-TOKEN']) {
      try{
        // decode if urlencoded
        this.headers = { ...defaultHeaders, 'x-xsrf-token': decodeURIComponent(cookies['XSRF-TOKEN']), ...headers };
      }catch(e){
        this.headers = { ...defaultHeaders, 'x-xsrf-token': cookies['XSRF-TOKEN'], ...headers };
      }
    } else {
      this.headers = { ...defaultHeaders, ...headers };
    }

    if (Object.keys(this.cookies).length) {
      this.headers['cookie'] = Object.entries(this.cookies).map(([k,v])=>`${k}=${v}`).join('; ');
    }
  }

  private async postJSON(url: string, body: any){
    const res = await fetch(url, { method: 'POST', headers: this.headers, body: JSON.stringify(body) });
    const text = await res.text();
    try{ return JSON.parse(text); }catch(e){ return text; }
  }

  // generate a new email address 
  async initGenerate(domain=false, plus=false, dot=false, google_mail=true): Promise<string>{
    const data: any = { email: [] };
    if (domain) data.email.push('domain');
    if (plus) data.email.push('plusGmail');
    if (dot) data.email.push('dotGmail');
    if (google_mail) data.email.push('googleMail');

    // call until we receive an email
    for(;;){
      const resp = await this.postJSON('https://www.emailnator.com/generate-email', data);
      if (resp && resp.email && resp.email.length) {
        this.email = resp.email[0];
        break;
      }
      // small delay
      await new Promise(r=>setTimeout(r, 500));
    }

    // load initial inbox ads
    const list = await this.postJSON('https://www.emailnator.com/message-list', { email: this.email });
    if (list && Array.isArray(list.messageData)){
      for (const ads of list.messageData) this.inbox_ads.push(ads.messageID);
    }

    return this.email;
  }

  // reload messages; if wait_for provided, will poll until condition met or timeout
  async reload(options: { wait?: boolean; retry?: number; timeout?: number; wait_for?: ((m:any)=>boolean) } = {}): Promise<any[] | undefined>{
    const wait = options.wait ?? false;
    const retry = options.retry ?? 5;
    const timeout = options.timeout ?? 30;
    const wait_for = options.wait_for;

    const start = Date.now();
    const new_msgs: any[] = [];

    for(;;){
      const list: any = await this.postJSON('https://www.emailnator.com/message-list', { email: this.email });
      const msgs = Array.isArray(list.messageData) ? list.messageData : [];

      for (const msg of msgs){
        if (!this.inbox_ads.includes(msg.messageID) && !this.inbox.find(m=>m.messageID===msg.messageID)){
          new_msgs.push(msg);
        }
      }

      if (wait && new_msgs.length === 0 || wait_for){
        if (wait_for && new_msgs.find(wait_for)) break;
        if ((Date.now() - start)/1000 > timeout) return undefined;
        await new Promise(r=>setTimeout(r, retry*1000));
        continue;
      }

      break;
    }

    this.inbox.push(...new_msgs);
    return new_msgs;
  }

  async open(msg_id: string): Promise<string>{
    const res = await fetch('https://www.emailnator.com/message-list', { method: 'POST', headers: this.headers, body: JSON.stringify({ email: this.email, messageID: msg_id }) });
    return await res.text();
  }

  get(func: (m:any)=>boolean, msgs?: any[]): any | undefined{
    const target = msgs ?? this.inbox;
    for (const m of target) if (func(m)) return m;
    return undefined;
  }
}

export default Emailnator;
