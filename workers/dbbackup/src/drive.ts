import type { Env } from './index';

const FOLDER_NAME = 'backup-kemana-uangku';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

type DriveFile = { id: string; name: string };
type DriveFileList = { files?: DriveFile[] };

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function getAccessToken(env: Env): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    throw new Error(`Google OAuth token exchange failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as { access_token?: string; error?: string };
  if (!json.access_token) {
    throw new Error(`Google OAuth token exchange did not return an access_token: ${json.error ?? 'unknown error'}`);
  }
  return json.access_token;
}

async function driveList(accessToken: string, query: string): Promise<DriveFile[]> {
  const url = `${DRIVE_FILES_URL}?q=${encodeURIComponent(query)}&fields=${encodeURIComponent('files(id,name)')}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Drive files.list failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as DriveFileList;
  return json.files ?? [];
}

export async function findOrCreateFolder(accessToken: string): Promise<string> {
  const query = `name='${escapeDriveQueryValue(FOLDER_NAME)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const existing = await driveList(accessToken, query);
  if (existing.length > 0) return existing[0].id;

  const res = await fetch(DRIVE_FILES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  if (!res.ok) {
    throw new Error(`Drive folder create failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as DriveFile;
  return json.id;
}

// Replaces the file's content in place if a file with this name already
// exists in the folder (same file id — no duplicate/version churn), else
// creates it. Content is always plain-text SQL.
export async function uploadOrReplaceFile(
  accessToken: string,
  folderId: string,
  filename: string,
  content: string
): Promise<void> {
  const query = `name='${escapeDriveQueryValue(filename)}' and '${folderId}' in parents and trashed=false`;
  const existing = await driveList(accessToken, query);

  if (existing.length > 0) {
    const fileId = existing[0].id;
    const res = await fetch(`${DRIVE_UPLOAD_URL}/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'text/plain',
      },
      body: content,
    });
    if (!res.ok) {
      throw new Error(`Drive file replace failed for ${filename}: ${res.status} ${res.statusText}`);
    }
    return;
  }

  const boundary = 'kemana-uangku-dbbackup-boundary';
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });
  const multipartBody =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/plain\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;

  const res = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });
  if (!res.ok) {
    throw new Error(`Drive file create failed for ${filename}: ${res.status} ${res.statusText}`);
  }
}
