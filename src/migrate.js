#!/usr/bin/env node

// Database migration script for Cloudflare D1
// Run with: wrangler d1 execute magnum-opus-db --file=./src/schema.sql

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

async function runMigration() {
  console.log('🚀 Starting database migration for Cloudflare D1...');
  
  try {
    // Read the schema file
    const schemaContent = fs.readFileSync('./src/schema.sql', 'utf8');
    console.log('📄 Schema file loaded');
    
    // Check if we're in development or production
    const isProduction = process.argv.includes('--production');
    const databaseName = isProduction ? 'magnum-opus-prod' : 'magnum-opus-staging';
    
    console.log(`📡 Connecting to database: ${databaseName}`);
    
    // Execute migration using wrangler
    const command = `wrangler d1 execute ${databaseName} --file=./src/schema.sql`;
    console.log(`Running: ${command}`);
    
    const { stdout, stderr } = await execAsync(command);
    
    if (stderr) {
      console.warn(`⚠️  Warning during migration: ${stderr}`);
    }
    
    if (stdout) {
      console.log(`✅ Migration output: ${stdout}`);
    }
    
    console.log('🎉 Database migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
runMigration().catch(console.error);