// Fail before a deployment build can embed a missing or privileged key.
const url = process.env.VITE_SUPABASE_URL?.trim();
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

if (url !== 'https://lqjkyezuqzqerkyccmzo.supabase.co') {
  throw new Error('The deployment must use the configured restaurant Supabase project URL.');
}
let publicKey = Boolean(key && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key));
if (!publicKey && key) {
  try {
    publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon';
  } catch { /* An invalid or privileged key must stop deployment. */ }
}
if (!publicKey) {
  throw new Error('Add the project publishable key as the GitHub Actions secret VITE_SUPABASE_PUBLISHABLE_KEY. Never use a secret/service-role key.');
}
console.log('Public deployment configuration validated. Key value is not logged.');
