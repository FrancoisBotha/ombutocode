const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function main() {
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, '..', '..', 'data', 'ombutocode.db');
  const buf = fs.readFileSync(dbPath);
  const db = new SQL.Database(buf);

  const maxSort = db.exec('SELECT MAX(sort_order) FROM backlog_tickets');
  let sortOrder = (maxSort[0].values[0][0] || 0) + 1;

  const feature_ref = '.ombutocode/features/feature_ADDRESS_SIMPLIFICATION.md';
  const today = '2026-03-17';

  const tickets = [
    {
      id: 'ODADR-001',
      title: 'Remove state/postcode/country and add townCity to Address entity',
      description: 'This ticket is part of feature ADDRESS_SIMPLIFICATION, which simplifies the Address entity to match Namibian addressing conventions.\n\nThis ticket focuses on the backend changes: remove the state, postcode, and country fields from the Address JPA entity and AddressDTO, add a new townCity field (String, required, max 100 chars), create a Liquibase migration to drop the old columns and add town_city, and update the fake-data CSV with Namibian town/city values.',
      dependencies: [],
      acceptance_criteria: [
        'Address.java entity has townCity field (String, required, max 100) and no state/postcode/country fields',
        'AddressDTO.java mirrors the entity changes (townCity, no state/postcode/country)',
        'Liquibase changelog drops state, postcode, country columns and adds town_city column to address table',
        'address.csv fake-data uses Namibian towns (Windhoek, Swakopmund, Walvis Bay, etc.)',
        'Backend compiles without errors'
      ],
      notes: 'DESIGN SPECIFICATION:\nRemove state, postcode, country fields and their getters/setters/fluent-methods from Address.java.\nAdd townCity field with @NotNull, @Size(max=100), @Column(name="town_city", length=100, nullable=false).\nUpdate AddressDTO.java similarly — remove old fields, add townCity with @NotNull @Size(min=1, max=100).\nMapStruct mapper (AddressMapper.java) needs no changes — field names match.\nCreate Liquibase changelog: dropColumn for state, postcode, country; addColumn for town_city.\nUpdate address.csv: replace state/postcode/country columns with town_city, use Namibian locations.\n\nFiles to modify:\n- mymed/src/main/java/com/mymed/backend/domain/Address.java\n- mymed/src/main/java/com/mymed/backend/service/dto/AddressDTO.java\n- mymed/src/main/resources/config/liquibase/fake-data/address.csv\n\nFiles to create:\n- mymed/src/main/resources/config/liquibase/changelog/20260317000001_simplify_address.xml\n\nRegister new changelog in mymed/src/main/resources/config/liquibase/master.xml.'
    },
    {
      id: 'ODADR-002',
      title: 'Update frontend Address model and Vue components for townCity',
      description: 'This ticket is part of feature ADDRESS_SIMPLIFICATION, which simplifies the Address entity to match Namibian addressing conventions.\n\nThis ticket focuses on the frontend changes: update the TypeScript Address model to remove state/postcode/country and add townCity, then update all Address-related Vue components (list, detail, create/edit forms) to reflect the new field structure.',
      dependencies: ['ODADR-001'],
      acceptance_criteria: [
        'address.model.ts IAddress interface has townCity field, no state/postcode/country',
        'Address class constructor initialises townCity',
        'address-update.vue form shows Town/City input field, not State/Postcode/Country',
        'address-details.vue displays Town/City, not State/Postcode/Country',
        'address.vue list view reflects the updated fields',
        'Frontend compiles without errors'
      ],
      notes: 'DESIGN SPECIFICATION:\nUpdate IAddress interface: remove state?, postcode?, country?, add townCity?.\nUpdate Address class: remove old fields from constructor, add townCity.\nUpdate address-update.vue: remove form groups for state, postcode, country; add form group for townCity (required, maxlength 100, label "Town/City").\nUpdate address-details.vue: remove display rows for state, postcode, country; add display row for townCity.\nUpdate address.vue (list): update table columns if state/postcode/country are shown.\n\nFiles to modify:\n- gateway/src/main/webapp/app/shared/model/mymed/address.model.ts\n- gateway/src/main/webapp/app/entities/mymed/address/address-update.vue\n- gateway/src/main/webapp/app/entities/mymed/address/address-details.vue\n- gateway/src/main/webapp/app/entities/mymed/address/address.vue'
    }
  ];

  const stmt = db.prepare('INSERT INTO backlog_tickets (id, sort_order, data) VALUES (?, ?, ?)');

  for (const t of tickets) {
    const data = {
      title: t.title,
      description: t.description,
      feature_ref: feature_ref,
      status: 'backlog',
      last_updated: today,
      dependencies: t.dependencies,
      acceptance_criteria: t.acceptance_criteria,
      notes: t.notes,
      fail_count: 0,
      eval_fail_count: 0,
      files_touched: [],
      assignee: null,
      agent: null,
      eval_summary: null,
      test_summary: null
    };
    stmt.run([t.id, sortOrder++, JSON.stringify(data)]);
    console.log('Created:', t.id, '-', t.title);
  }
  stmt.free();

  const outBuf = db.export();
  fs.writeFileSync(dbPath, Buffer.from(outBuf));
  console.log('\nDone. Total tickets now:', db.exec('SELECT count(*) FROM backlog_tickets')[0].values[0][0]);
  db.close();
}
main().catch(console.error);
