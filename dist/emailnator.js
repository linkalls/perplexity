/**
 * Emailnator
 *
 * Lightweight client to interact with https://www.emailnator.com for
 * generating temporary email addresses and polling for messages.
 */
/**
 * Emailnator
 *
 * Lightweight client for interacting with Emailnator.com to generate
 * temporary email addresses and poll for incoming messages. Useful for
 * automated account creation flows.
 */
export class Emailnator {
    email = "";
    headers;
    cookies;
    inbox = [];
    inbox_ads = [];
    constructor(cookies = {}, headers = {}) {
        this.cookies = cookies || {};
        const defaultHeaders = {
            accept: "application/json, text/plain, */*",
            "accept-language": "en-US,en;q=0.9",
            "content-type": "application/json",
            dnt: "1",
            origin: "https://www.emailnator.com",
            referer: "https://www.emailnator.com/",
            "user-agent": "bun-emailnator-client/0.1",
            "x-requested-with": "XMLHttpRequest",
        };
        if (cookies["XSRF-TOKEN"]) {
            try {
                // decode if urlencoded
                this.headers = {
                    ...defaultHeaders,
                    "x-xsrf-token": decodeURIComponent(cookies["XSRF-TOKEN"]),
                    ...headers,
                };
            }
            catch (e) {
                this.headers = {
                    ...defaultHeaders,
                    "x-xsrf-token": cookies["XSRF-TOKEN"],
                    ...headers,
                };
            }
        }
        else {
            this.headers = { ...defaultHeaders, ...headers };
        }
        if (Object.keys(this.cookies).length) {
            this.headers["cookie"] = Object.entries(this.cookies)
                .map(([k, v]) => `${k}=${v}`)
                .join("; ");
        }
    }
    async postJSON(url, body) {
        const res = await fetch(url, {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify(body),
        });
        const text = await res.text();
        // Debug: if this is the message-list endpoint, log the full response for diagnosis
        try {
            if (url.includes("message-list")) {
                try {
                    console.log("Emailnator message-list response (full):", text);
                }
                catch (e) {
                    // ignore logging errors
                }
            }
        }
        catch (e) {
            // ignore
        }
        try {
            return JSON.parse(text);
        }
        catch (e) {
            // return raw text but include a debug hint
            return text;
        }
    }
    // generate a new email address
    /**
     * initGenerate(domain=false, plus=false, dot=false, google_mail=true)
     *
     * Request generation of a new temporary address and preload the inbox
     * state. Returns the generated email address.
     */
    async initGenerate(domain = false, plus = false, dot = false, google_mail = true) {
        const data = { email: [] };
        if (domain)
            data.email.push("domain");
        if (plus)
            data.email.push("plusGmail");
        if (dot)
            data.email.push("dotGmail");
        if (google_mail)
            data.email.push("googleMail");
        // call until we receive an email (with a safety timeout)
        const start = Date.now();
        for (;;) {
            const resp = await this.postJSON("https://www.emailnator.com/generate-email", data);
            if (resp && resp.email && resp.email.length) {
                this.email = resp.email[0];
                break;
            }
            if ((Date.now() - start) / 1000 > 30) {
                throw new Error("timeout waiting for email generation from Emailnator");
            }
            // small delay
            await new Promise((r) => setTimeout(r, 500));
        }
        // load initial inbox ads
        const list = await this.postJSON("https://www.emailnator.com/message-list", { email: this.email });
        if (list && Array.isArray(list.messageData)) {
            for (const ads of list.messageData)
                this.inbox_ads.push(ads.messageID);
        }
        return this.email;
    }
    // reload messages; if wait_for provided, will poll until condition met or timeout
    /**
     * reload(options)
     *
     * Refresh inbox messages and optionally poll until a predicate matches
     * a new message or a timeout occurs.
     */
    async reload(options = {}) {
        const wait = options.wait ?? false;
        const retry = options.retry ?? 5;
        const timeout = options.timeout ?? 30;
        const wait_for = options.wait_for;
        const start = Date.now();
        const new_msgs = [];
        for (;;) {
            const list = await this.postJSON("https://www.emailnator.com/message-list", { email: this.email });
            const msgs = Array.isArray(list.messageData) ? list.messageData : [];
            for (const msg of msgs) {
                if (!this.inbox_ads.includes(msg.messageID) &&
                    !this.inbox.find((m) => m.messageID === msg.messageID)) {
                    new_msgs.push(msg);
                }
            }
            if ((wait && new_msgs.length === 0) || wait_for) {
                if (wait_for && new_msgs.find(wait_for))
                    break;
                if ((Date.now() - start) / 1000 > timeout)
                    return undefined;
                await new Promise((r) => setTimeout(r, retry * 1000));
                continue;
            }
            break;
        }
        this.inbox.push(...new_msgs);
        return new_msgs;
    }
    /**
     * open(msg_id)
     *
     * Fetch the raw message body for the given message id.
     */
    async open(msg_id) {
        const res = await fetch("https://www.emailnator.com/message-list", {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify({ email: this.email, messageID: msg_id }),
        });
        return await res.text();
    }
    /**
     * Find a message matching `func` in the provided messages or the inbox.
     */
    get(func, msgs) {
        const target = msgs ?? this.inbox;
        for (const m of target)
            if (func(m))
                return m;
        return undefined;
    }
    /**
     * Find a message by subject. `pattern` can be a string or RegExp.
     * If string, matches exact subject or substring.
     */
    findBySubject(pattern, msgs) {
        const matcher = (m) => {
            const s = m && (m.subject || "");
            if (typeof pattern === "string")
                return s === pattern || s.includes(pattern);
            try {
                return pattern.test(s);
            }
            catch (e) {
                return false;
            }
        };
        return this.get(matcher, msgs);
    }
    /**
     * Find a message by From/sender. `pattern` can be a string or RegExp.
     * If string, matches exact `from` field or substring; also checks common header fields.
     */
    findByFrom(pattern, msgs) {
        const matcher = (m) => {
            const candidates = [
                m && (m.from || ""),
                m && (m.sender || ""),
                m && (m.mail_from || ""),
            ];
            for (const c of candidates) {
                if (!c)
                    continue;
                if (typeof pattern === "string" &&
                    (c === pattern || c.includes(pattern)))
                    return true;
                if (pattern instanceof RegExp) {
                    try {
                        if (pattern.test(c))
                            return true;
                    }
                    catch (e) {
                        // ignore
                    }
                }
            }
            return false;
        };
        return this.get(matcher, msgs);
    }
    /**
     * Build a mailbox URL like:
     *  https://www.emailnator.com/mailbox/{email}/{messageIdBase64}
     * If messageId looks like raw text it will be base64-encoded.
     */
    static makeMailboxUrl(email, messageId) {
        const encEmail = encodeURIComponent(email);
        let idPart = "";
        if (messageId) {
            const isBase64 = /^[A-Za-z0-9+/=]+$/.test(messageId) && messageId.length % 4 === 0;
            idPart =
                "/" +
                    (isBase64 ? messageId : Buffer.from(messageId).toString("base64"));
        }
        return `https://www.emailnator.com/mailbox/${encEmail}${idPart}`;
    }
    /**
     * Parse a mailbox URL and return { email, messageId, messageIdDecoded } or null on error.
     */
    static parseMailboxUrl(url) {
        try {
            const u = new URL(url);
            const parts = u.pathname.split("/").filter(Boolean); // ['mailbox','email','id']
            if (parts[0] !== "mailbox")
                return null;
            const email = decodeURIComponent(parts[1] || "");
            const messageId = parts[2] || undefined;
            let messageIdDecoded = undefined;
            if (messageId) {
                try {
                    messageIdDecoded = Buffer.from(messageId, "base64").toString("utf8");
                }
                catch (e) {
                    // ignore decode errors
                }
            }
            return { email, messageId, messageIdDecoded };
        }
        catch (e) {
            return null;
        }
    }
    /**
     * Instance helper to build a mailbox URL for the current `this.email`.
     */
    makeMailboxUrl(messageId) {
        return Emailnator.makeMailboxUrl(this.email, messageId);
    }
}
export default Emailnator;
