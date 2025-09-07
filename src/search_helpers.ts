// Shared helpers extracted from perplexity client to keep implementation small
import type { PerplexityChunk,Models } from './types';

export function cryptoRandomUuid() {
  if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') return (crypto as any).randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) { const r = Math.random()*16|0; const v = c==='x'?r:(r&0x3|0x8); return v.toString(16); });
}

export function ensureSearchArgs(self: any, mode: string, sources: Array<string>, files: Record<string, any>) {
  if (!['auto','pro','reasoning','deep research'].includes(mode)) throw new Error('Invalid search mode.');
  if (!sources.every((s: string)=>['web','scholar','social'].includes(s))) throw new Error('Invalid sources.');
  if ((mode === 'pro' || mode === 'reasoning' || mode === 'deep research') && self.copilot <= 0) throw new Error('No remaining pro queries.');
  if (files && Object.keys(files).length && self.file_upload - Object.keys(files).length < 0) throw new Error('File upload limit exceeded.');

  if (mode === 'pro' || mode === 'reasoning' || mode === 'deep research') self.copilot = Math.max(0, self.copilot - 1);
  if (files && Object.keys(files).length) self.file_upload = Math.max(0, self.file_upload - Object.keys(files).length);
}

export async function uploadFiles(self: any, files: Record<string, any>): Promise<string[]> {
  const uploaded_files: string[] = [];
  for (const [filename, file] of Object.entries(files || {})) {
    const file_type = self.guessMime(filename);
    const file_size = self.sizeOf(file);

    const createResp = await fetch(self.base + '/rest/uploads/create_upload_url?version=2.18&source=default', {
      method: 'POST',
      headers: self.buildHeaders(),
      body: JSON.stringify({ content_type: file_type, file_size, filename, force_image: false, source: 'default' })
    });

    if (!createResp.ok) throw new Error('create upload url error');
    const file_upload_info = await createResp.json();

    const form = new FormData();
    for (const [k,v] of Object.entries(file_upload_info.fields || {})) {
      form.append(k, String(v));
    }

    if (typeof Blob !== 'undefined' && file instanceof Blob) {
      form.append('file', file as Blob, filename);
    } else if (file instanceof Uint8Array || file instanceof ArrayBuffer) {
      form.append('file', new Blob([file as any], { type: file_type }), filename);
    } else if (typeof file === 'string') {
      form.append('file', new Blob([file], { type: file_type }), filename);
    } else {
      form.append('file', new Blob([JSON.stringify(file)], { type: file_type }), filename);
    }

    const uploadResp = await fetch(file_upload_info.s3_bucket_url, {
      method: 'POST',
      body: form
    });

    if (!uploadResp.ok) throw new Error('File upload error');

    let uploaded_url = file_upload_info.s3_object_url;
    try {
      const upjson = await uploadResp.json();
      if (upjson && upjson.secure_url) {
        if (file_upload_info.s3_object_url && file_upload_info.s3_object_url.includes('image/upload')) {
          uploaded_url = upjson.secure_url.replace(/\/private\/s--.*?--\/v\d+\/user_uploads\//, '/private/user_uploads/');
        } else {
          uploaded_url = file_upload_info.s3_object_url;
        }
      }
    } catch (e) {
      // keep fallback
    }

    uploaded_files.push(uploaded_url);
  }
  return uploaded_files;
}

export function buildModelPrefMap(): any {
  // Expanded mapping based on observed accepted/displayed model names from probing.
  // Normalization in computeModelPreference will also help match many variants.
  return {
    auto: { '__default': 'turbo' },
    pro: {
      '__default': 'pplx_pro',
      'sonar': 'experimental',
      'experimental': 'experimental',
      'gpt5': 'gpt5',
      'gpt5_nano': 'gpt5_nano',
      'gpt45': 'gpt45',
      'claude_sonnet_4_0': 'claude2',
      'claude37sonnetthinking': 'claude37sonnetthinking',
      'o3mini': 'o3mini',
      'gemini25pro': 'Gemini25Pro',
      'grok': 'grok'
    },
    reasoning: {
      '__default': 'pplx_reasoning',
      'gemini25pro': 'Gemini25Pro',
      'gpt5': 'gpt5',
      'o3mini': 'o3mini',
      'claude37sonnetthinking': 'claude37sonnetthinking'
    },
    'deep research': { '__default': 'pplx_alpha' }
  };
}

export function computeModelPreference(mode: string, model: Models | null): string | undefined {
  const map = buildModelPrefMap();
  const byMode = map[mode];
  if (!byMode) return undefined;
  if (!model) return byMode['__default'];

  // direct key match
  if (Object.prototype.hasOwnProperty.call(byMode, model as any)) return byMode[model as any];

  const normalize = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const mnorm = normalize(model);

  // try normalized key match
  for (const k of Object.keys(byMode)) {
    if (normalize(k) === mnorm) return byMode[k];
  }

  // try matching against normalized values (in case caller passes canonical value)
  for (const k of Object.keys(byMode)) {
    const v = byMode[k];
    if (normalize(v) === mnorm) return v;
  }

  return byMode['__default'];
}

export function buildSearchJsonBody(self: any, query: string, mode: string, model: Models | null, uploaded_files: string[], follow_up: any, incognito: boolean, language: string, sources: Array<string>) {
  const model_preference = computeModelPreference(mode, model);
  return {
    query_str: query,
    params: {
      attachments: (uploaded_files.concat((follow_up && follow_up.attachments) ? follow_up.attachments : [])),
      frontend_context_uuid: cryptoRandomUuid(),
      frontend_uuid: cryptoRandomUuid(),
      is_incognito: incognito,
      language,
      last_backend_uuid: follow_up?.backend_uuid ?? null,
      mode: mode === 'auto' ? 'concise' : 'copilot',
      model_preference,
      source: 'default',
      sources,
      version: '2.18'
    }
  };
}

export async function postSearch(self: any, jsonBody: any): Promise<Response> {
  return await fetch(self.base + '/rest/sse/perplexity_ask', {
    method: 'POST',
    headers: self.buildHeaders(),
    body: JSON.stringify(jsonBody)
  });
}

// Helper: given an async generator that yields PerplexityChunk objects (the
// output of PerplexityClient.asyncSearch), yield only textual response pieces
// as they arrive. This filters `chunk.text` and also inspects incremental
// `blocks` for `ask_text` blocks containing `markdown_block.answer` or chunks.
// More advanced extractor: yields objects { text, backend_uuid? } as pieces
// arrive. Text pieces are merged/normalized: consecutive fragments are joined
// with appropriate spaces/newlines preserved when reasonable.
// ...existing code...
export async function* extractStreamEntries(stream: AsyncGenerator<PerplexityChunk, any, void>): AsyncGenerator<{text: string, backend_uuid?: string}, void, void> {
  // Normalize pieces: preserve meaningful newlines, collapse excessive spaces/tabs,
  // and avoid destroying spacing inside paragraphs.


  for await (const chunk of stream) {
    try {
      const backend = (chunk as any).backend_uuid as string | undefined;

  // Collect text pieces from chunk.text and ask_text blocks.
  const outPieces: string[] = [];

      if (chunk.text) {
        const arr = Array.isArray(chunk.text) ? chunk.text : [chunk.text];
        for (const t of arr) {
          if (t === null || t === undefined) continue;
          if (typeof t === 'string') outPieces.push(t);
          else outPieces.push(JSON.stringify(t));
        }
      }

      if (chunk.blocks && Array.isArray(chunk.blocks)) {
        for (const b of chunk.blocks) {
          if (!b || typeof b !== 'object') continue;
          if ((b as any).intended_usage === 'ask_text' && (b as any).markdown_block) {
            const md = (b as any).markdown_block;
            if (md.answer && typeof md.answer === 'string') {
              outPieces.push(md.answer);
            } else if (md.chunks) {
              const chunks = Array.isArray(md.chunks) ? md.chunks : [md.chunks];
              outPieces.push(chunks.filter((x:any)=>x!=null).map((x:any)=>typeof x==='string'?x:JSON.stringify(x)).join(''));
            }
          } else {
            // best-effort: try to pull readable text from other block kinds (e.g. web result snippets)
            try {
              // web_result_block.web_results[].snippet
              if ((b as any).web_result_block && Array.isArray((b as any).web_result_block.web_results)) {
                for (const r of (b as any).web_result_block.web_results) {
                  if (r && typeof r.snippet === 'string' && r.snippet.trim()) outPieces.push(r.snippet);
                }
              }
              // plan_block goals/descriptions
              if ((b as any).plan_block && Array.isArray((b as any).plan_block.goals)) {
                for (const g of (b as any).plan_block.goals) {
                  if (g && typeof g.description === 'string' && g.description.trim()) outPieces.push(g.description);
                }
              }
            } catch (e) {
              // ignore extraction errors
            }
          }
        }
      }

      if (outPieces.length > 0) {
        // Merge pieces: do not inject extra spaces (pieces often contain their own spacing/newlines).
        const mergedRaw = outPieces.join('');
        if (mergedRaw) yield { text: mergedRaw, backend_uuid: backend };
      } else if (backend) {
        // Emit backend arrival even if there's no text yet (keeps backward compatibility).
        yield { text: '', backend_uuid: backend };
      }
    } catch (e) {
      continue;
    }
  }
}

// Backwards-compatible wrapper: yields only strings (text). If a chunk also
// contains backend_uuid, this wrapper will ignore it; use extractStreamEntries
// if you need the backend_uuid together with text.
export async function* extractStreamAnswers(stream: AsyncGenerator<PerplexityChunk, any, void>): AsyncGenerator<string, void, void> {
  for await (const e of extractStreamEntries(stream)) {
    if (e.text && typeof e.text === 'string' && e.text.trim()) yield e.text;
  }
}

// New extractor: yield backend_uuid strings as they become available from the
// stream. This is similar to extractStreamAnswers but focuses solely on the
// backend identifier. It will yield each unique backend_uuid arrival (including
// empty text events that only carry backend_uuid). Callers can use this to
// capture the conversation's backend id for follow-up queries.
export async function* extractStreamBackend(stream: AsyncGenerator<PerplexityChunk, any, void>): AsyncGenerator<string, void, void> {
  const seen = new Set<string>();
  for await (const e of extractStreamEntries(stream)) {
    if (e.backend_uuid && typeof e.backend_uuid === 'string') {
      // Avoid re-yielding the same backend_uuid repeatedly unless it changes.
      if (!seen.has(e.backend_uuid)) {
        seen.add(e.backend_uuid);
        yield e.backend_uuid;
      }
    }
  }
}
