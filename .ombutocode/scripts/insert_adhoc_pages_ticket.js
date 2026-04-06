const initSqlJs = require(require('path').join(__dirname, '..', 'src', 'node_modules', 'sql.js'));
const fs = require('fs');
const path = require('path');

async function main() {
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, '..', 'data', 'ombutocode.db');
  const buf = fs.readFileSync(dbPath);
  const db = new SQL.Database(buf);

  const maxSort = db.exec('SELECT MAX(sort_order) FROM backlog_tickets');
  const sortOrder = (maxSort[0].values[0][0] || 0) + 1;

  const ticket = {
    id: 'ADHOC-001',
    data: {
      title: 'Frontend: Implement About Us, Contact Us, and Privacy Policy pages',
      description: 'Create three static content pages for the patient-facing Nuxt frontend: About Us, Contact Us, and Privacy Policy. These pages should be accessible from the site footer and follow the existing design system (Quasar + CSS variables). Content should be placeholder text appropriate for Oshili Doc (Namibia healthcare booking platform) that can be refined later.',
      feature_ref: null,
      status: 'backlog',
      last_updated: '2026-03-26',
      dependencies: [],
      acceptance_criteria: [
        '/about page exists with About Us content: mission statement, what Oshili Doc is, team/company placeholder',
        '/contact page exists with Contact Us content: email address, phone placeholder, simple contact form or mailto link',
        '/privacy page exists with Privacy Policy content: data collection, usage, storage, and rights placeholder sections',
        'All three pages are linked from the site footer',
        'Pages follow existing frontend design system (Quasar components, CSS variables, mobile-first)',
        'Pages are SSR-rendered for SEO',
        'Navigation from footer links works correctly',
        'Pages render correctly on mobile and desktop'
      ],
      eval_summary: null,
      files_touched: [],
      notes: 'DESIGN SPECIFICATION:\n1. Create three new Nuxt pages:\n   - frontend/pages/about.vue\n   - frontend/pages/contact.vue\n   - frontend/pages/privacy.vue\n2. Each page should use a consistent layout: centered content container, max-width ~800px, clean typography.\n3. About Us: brief intro to Oshili Doc ("Oshili means it is true in Oshiwambo"), mission to connect patients with private healthcare in Namibia, placeholder team section.\n4. Contact Us: email (hello@oshili.doc or placeholder), phone placeholder, physical address placeholder (Windhoek, Namibia). Optionally a simple form that could be wired up later.\n5. Privacy Policy: standard sections — what data we collect, how we use it, how we store it, user rights, cookie usage, third-party services (WhatsApp). Placeholder legal text.\n6. Update the site footer component to include links to /about, /contact, /privacy.\n7. Find the footer in frontend/components/ or frontend/layouts/ and add the links.\nFiles to create: frontend/pages/about.vue, frontend/pages/contact.vue, frontend/pages/privacy.vue\nFiles to modify: footer component (likely in frontend/components/ or frontend/layouts/)',
      assignee: null,
      fail_count: 0,
      eval_fail_count: 0,
      agent: null
    }
  };

  db.run('INSERT INTO backlog_tickets (id, sort_order, data) VALUES (?, ?, ?)',
    [ticket.id, sortOrder, JSON.stringify(ticket.data)]);
  console.log('Inserted:', ticket.id);

  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  console.log('Database saved.');
}
main().catch(console.error);
