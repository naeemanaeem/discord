// googleAuth.js
import { google } from 'googleapis';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname for ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function getAuthedClient() {
  const credentialsPath = path.join(__dirname, 'credentials.json');
  const credentials = JSON.parse(await readFile(credentialsPath, 'utf-8'));

  const scopes = ['https://www.googleapis.com/auth/calendar'];
  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    scopes
  );
  await auth.authorize();
  return auth;
}
