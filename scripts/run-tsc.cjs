#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const projectIndex = args.indexOf('-p');
const projectPath = projectIndex !== -1 ? args[projectIndex + 1] : 'tsconfig.json';

// Run TypeScript compiler
const tscProcess = spawn('npx', ['tsc', '-p', projectPath], {
  stdio: 'inherit',
  shell: true,
  cwd: path.join(__dirname, '..')
});

tscProcess.on('close', (code) => {
  if (code === 0) {
    console.log('TypeScript compilation completed successfully');
  } else {
    console.error('TypeScript compilation failed');
    process.exit(code);
  }
});

tscProcess.on('error', (err) => {
  console.error('Failed to start TypeScript compiler:', err);
  process.exit(1);
});