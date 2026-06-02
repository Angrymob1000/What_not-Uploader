/*
  Whatnot Uploader — image relay (Cloudflare Worker).

  Phones can't upload to Catbox directly (the browser blocks it for security/CORS).
  This tiny worker receives a photo from the app and forwards it to Catbox, then
  returns the public https link with the CORS header the phone needs.

  SETUP (one time, free):
    1. dash.cloudflare.com  ->  Workers & Pages  ->  Create  ->  Create Worker  ->  Deploy
    2. Edit code  ->  delete everything  ->  paste THIS whole file  ->  Deploy
    3. Copy the worker URL (https://something.workers.dev)
    4. Paste it into the app:  Settings  ->  Image upload link
*/

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return new Response('POST a photo as form field "file".', { status: 405, headers: cors });

    try {
      const form = await request.formData();
      const file = form.get('file');
      if (!file) return new Response('No file.', { status: 400, headers: cors });

      const cb = new FormData();
      cb.append('reqtype', 'fileupload');
      cb.append('fileToUpload', file, file.name || 'photo.jpg');

      const r = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: cb });
      const url = (await r.text()).trim();

      if (!/^https?:\/\//.test(url)) {
        return new Response('Upload host error: ' + url, { status: 502, headers: cors });
      }
      return new Response(url, { headers: { ...cors, 'Content-Type': 'text/plain' } });
    } catch (e) {
      return new Response('Relay error: ' + (e && e.message ? e.message : e), { status: 500, headers: cors });
    }
  },
};
