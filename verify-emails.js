const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DB_PATH = path.join(__dirname, 'db.json');
const DISPOSABLE_PATH = path.join(__dirname, 'data', 'disposable-domains.json');

// Load disposable domains
const disposableDomains = new Set(
  JSON.parse(fs.readFileSync(DISPOSABLE_PATH, 'utf8')).domains.map(d => d.toLowerCase())
);

function isValidFormat(email) {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email) 
    && !email.includes(' ') 
    && !email.includes('..');
}

function hasMXRecords(email) {
  const domain = email.split('@')[1];
  if (!domain || !/^[a-zA-Z0-9.-]+$/.test(domain)) return false;
  try {
    const result = execSync(`nslookup -type=mx ${domain} 2>&1`, { timeout: 5000, encoding: 'utf8' });
    return result.includes('MX preference') || result.includes('mail exchanger');
  } catch {
    return false;
  }
}

async function verifyEmail(email) {
  if (!isValidFormat(email)) return { valid: false, reason: 'Invalid format' };
  if (disposableDomains.has(email.split('@')[1]?.toLowerCase())) return { valid: false, reason: 'Disposable domain' };
  if (!hasMXRecords(email)) return { valid: false, reason: 'No MX records' };
  return { valid: true, reason: 'Valid' };
}

async function main() {
  const args = process.argv.slice(2);
  
  // Test single email
  if (args.includes('--test')) {
    const email = args.find(a => a.includes('@'));
    if (!email) return console.log('Usage: node verify-emails.js --test email@example.com');
    const result = await verifyEmail(email);
    console.log(`${result.valid ? '✅' : '❌'} ${email}: ${result.reason}`);
    return;
  }

  // Verify all prospects
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const prospects = db.prospects || [];
  const unsent = args.includes('--unsent') ? prospects.filter(p => !p.lastEmailed) : prospects;
  
  console.log(`Verifying ${unsent.length} emails...`);
  let valid = 0, invalid = 0;

  for (const prospect of unsent) {
    const result = await verifyEmail(prospect.email);
    prospect.emailVerified = result.valid;
    prospect.emailVerificationStatus = result.valid ? 'valid' : 'invalid';
    prospect.emailVerificationReason = result.reason;
    if (result.valid) valid++; else invalid++;
  }

  // Save
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  console.log(`\n✅ Done: ${valid} valid, ${invalid} invalid`);
}

main().catch(console.error);
