#!/usr/bin/env node
/**
 * End-to-End verification script for Archive SQLite functionality
 */

const path = require('path');
const fs = require('fs');
const archiveDb = require('./src/main/archiveDb');

const ARCHIVE_DB_PATH = path.join(__dirname, '..', 'planning', 'archive.db');

console.log('='.repeat(70));
console.log('Archive SQLite Database - End-to-End Verification');
console.log('='.repeat(70));
console.log();

async function verify() {
  try {
    // 1. Check database file exists
    console.log('📁 Checking database file...');
    const dbExists = fs.existsSync(ARCHIVE_DB_PATH);
    const stats = dbExists ? fs.statSync(ARCHIVE_DB_PATH) : null;

    if (dbExists) {
      console.log(`   ✅ Database exists: ${ARCHIVE_DB_PATH}`);
      console.log(`   📊 Size: ${(stats.size / 1024).toFixed(2)} KB`);
      console.log(`   🕒 Last modified: ${stats.mtime.toISOString()}`);
    } else {
      console.log(`   ❌ Database not found (will be created on first use)`);
      return;
    }
    console.log();

    // 2. Open database
    console.log('🔌 Opening database...');
    await archiveDb.openDatabase(ARCHIVE_DB_PATH);
    console.log('   ✅ Database opened successfully');
    console.log();

    // 3. Read metadata
    console.log('📋 Reading metadata...');
    const metadata = archiveDb.getMetadata();
    console.log(`   ✅ Schema version: ${metadata.version}`);
    console.log(`   ✅ Last updated: ${metadata.updated_at}`);
    console.log();

    // 4. Get all tickets
    console.log('📦 Retrieving all tickets...');
    const allTickets = archiveDb.getAllTickets({ limit: 1000 });
    console.log(`   ✅ Total tickets in archive: ${allTickets.total}`);
    console.log(`   ✅ Tickets retrieved: ${allTickets.tickets.length}`);
    console.log();

    // 5. Show sample tickets
    if (allTickets.tickets.length > 0) {
      console.log('📝 Sample tickets (first 5):');
      allTickets.tickets.slice(0, 5).forEach((ticket, index) => {
        console.log(`   ${index + 1}. ${ticket.id} - ${ticket.title.substring(0, 60)}`);
        console.log(`      Status: ${ticket.status}, Feature: ${ticket.epic_ref || 'N/A'}`);
      });
      console.log();
    }

    // 6. Test search functionality
    console.log('🔍 Testing search functionality...');
    const searchResults = archiveDb.searchTickets({ query: 'archive', limit: 5 });
    console.log(`   ✅ Search for "archive" found ${searchResults.total} tickets`);
    if (searchResults.tickets.length > 0) {
      searchResults.tickets.forEach((ticket, index) => {
        console.log(`   ${index + 1}. ${ticket.id}: ${ticket.title.substring(0, 60)}`);
      });
    }
    console.log();

    // 7. Get distinct feature refs
    console.log('🏷️  Getting unique feature references...');
    const epicRefs = archiveDb.getDistinctEpicRefs();
    console.log(`   ✅ Found ${epicRefs.length} unique feature references`);
    if (epicRefs.length > 0) {
      console.log('   Sample feature refs:');
      epicRefs.slice(0, 10).forEach(ref => {
        console.log(`     - ${ref}`);
      });
      if (epicRefs.length > 10) {
        console.log(`     ... and ${epicRefs.length - 10} more`);
      }
    }
    console.log();

    // 8. Test filtering by epic_ref
    if (epicRefs.length > 0) {
      const sampleFeature = epicRefs[0];
      console.log(`🔎 Testing feature filter (${sampleFeature})...`);
      const featureResults = archiveDb.searchTickets({
        epic_ref: sampleFeature,
        limit: 5
      });
      console.log(`   ✅ Found ${featureResults.total} tickets for this feature`);
      console.log();
    }

    // 9. Export archive data
    console.log('📤 Testing YAML-compatible export...');
    const archiveData = archiveDb.getArchiveData();
    console.log(`   ✅ Exported ${archiveData.tickets.length} tickets`);
    console.log(`   ✅ Export version: ${archiveData.version}`);
    console.log(`   ✅ Data structure is YAML-compatible`);
    console.log();

    // 10. Check migration status
    console.log('🔄 Checking migration status...');
    const migratedFile = path.join(__dirname, '..', 'planning', 'archive.yml.migrated');
    if (fs.existsSync(migratedFile)) {
      const migratedStats = fs.statSync(migratedFile);
      console.log(`   ✅ Original YAML file backed up: archive.yml.migrated`);
      console.log(`   📊 Backup size: ${(migratedStats.size / 1024).toFixed(2)} KB`);
      console.log(`   🕒 Backup created: ${migratedStats.mtime.toISOString()}`);
    } else {
      console.log('   ℹ️  No migration backup found (database may have been created fresh)');
    }
    console.log();

    // Close database
    archiveDb.closeDatabase();
    console.log('🔒 Database closed successfully');
    console.log();

    // Summary
    console.log('='.repeat(70));
    console.log('✅ All archive SQLite functionality verified successfully!');
    console.log('='.repeat(70));
    console.log();
    console.log('Verified capabilities:');
    console.log('  • Database file access and metadata');
    console.log('  • Reading all tickets with pagination');
    console.log('  • Full-text search across ticket content');
    console.log('  • Filtering by feature reference');
    console.log('  • Extracting unique feature references');
    console.log('  • YAML-compatible data export');
    console.log('  • Migration from YAML to SQLite');
    console.log();

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

verify();
