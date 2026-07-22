#!/usr/bin/env node
// One-time local script to mint a Google OAuth refresh token for the
// dbbackup Worker. Run this once during setup (see ../SETUP.md), then store
// the printed refresh token as the GOOGLE_REFRESH_TOKEN secret — it is never
// used again after that.
//
// Usage:
//   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/get-refresh-token.mjs
//
// Requires a Google Cloud OAuth client of type "Desktop app" (see SETUP.md).
// Desktop app clients accept any http://localhost:<port> redirect URI
// without needing it pre-registered, which is what this script relies on.

import http from 'node:http';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const PORT = 8976;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables first.');
  process.exit(1);
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPE);
authUrl.searchParams.set('access_type', 'offline');
// Forces the consent screen (and thus a refresh_token) even if this Google
// account has previously authorized this OAuth client.
authUrl.searchParams.set('prompt', 'consent');

console.log('Open this URL in a browser and approve access:\n');
console.log(authUrl.toString());
console.log(`\nWaiting for the redirect to ${REDIRECT_URI} ...`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== '/oauth2callback') {
    res.writeHead(404);
    res.end();
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end(`Authorization failed: ${error}. You can close this tab.`);
    console.error(`Authorization failed: ${error}`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing ?code param. You can close this tab.');
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Authorization received. You can close this tab and return to the terminal.');
  server.close();

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
      }),
    });

    const json = await tokenRes.json();
    if (!tokenRes.ok || !json.refresh_token) {
      console.error('Token exchange failed:', JSON.stringify(json, null, 2));
      console.error(
        '\nIf there is no refresh_token in the response, this Google account likely already ' +
          'granted this app access previously. Revoke access at ' +
          'https://myaccount.google.com/permissions and run this script again.'
      );
      process.exit(1);
    }

    console.log('\nSuccess. Store this as the GOOGLE_REFRESH_TOKEN secret:\n');
    console.log(json.refresh_token);
    process.exit(0);
  } catch (err) {
    console.error('Token exchange request failed:', err);
    process.exit(1);
  }
});

server.listen(PORT);
