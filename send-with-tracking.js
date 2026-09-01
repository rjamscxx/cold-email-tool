const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const SMTP_CONFIG = {
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'rjamscxx@gmail.com',
    pass: 'xkrc yebb fyft bsnr'
  }
};

const DB_PATH = path.join(__dirname, 'db.json');
const TEMPLATES_PATH = path.join(__dirname, 'data', 'all-email-templates.json');

async function sendEmails(limit = 100) {
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const prospects = db.prospects || [];
  const templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8')).templates || [];
  
  // Build template lookup by email
  const templateMap = {};
  templates.forEach(t => { templateMap[t.email] = t; });
  
  // Get unsent prospects with templates
  const unsent = prospects.filter(p => !p.lastEmailed && p.email && templateMap[p.email]);
  const batch = unsent.slice(0, limit);
  
  console.log(`Found ${unsent.length} unsent prospects, sending ${batch.length}...`);
  
  const transporter = nodemailer.createTransport(SMTP_CONFIG);
  try {
    await transporter.verify();
    console.log('SMTP verified\n');
  } catch (err) {
    console.error('SMTP failed:', err.message);
    return;
  }
  
  let sent = 0, failed = 0;
  
  for (const prospect of batch) {
    const template = templateMap[prospect.email];
    try {
      await transporter.sendMail({
        from: '"Robert James Cabansay" <rjamscxx@gmail.com>',
        to: prospect.email,
        subject: template.subject,
        text: template.body,
        html: template.body.replace(/\n/g, '<br>')
      });
      
      sent++;
      prospect.lastEmailed = new Date().toISOString();
      console.log(`✅ [${sent}/${batch.length}] ${prospect.name}`);
      
      if (sent % 10 === 0) {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
      }
      
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      failed++;
      console.log(`❌ ${prospect.name}: ${err.message.substring(0, 50)}`);
      if (err.message.includes('550') || err.message.includes('rate')) {
        console.log('\nRate limit hit, stopping...');
        break;
      }
    }
  }
  
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  console.log(`\nDone: ${sent} sent, ${failed} failed`);
}

const limit = parseInt(process.argv[2]) || 100;
sendEmails(limit).catch(console.error);
