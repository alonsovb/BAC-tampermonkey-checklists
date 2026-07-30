#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const envPath = path.join(rootDir, '.env');

if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const rawBaseUrl = process.env.API_BASE_URL;
if (!rawBaseUrl) {
  console.error('Missing API_BASE_URL — create a .env file (see .env.example) before building.');
  process.exit(1);
}

const apiBaseUrl = rawBaseUrl.replace(/\/+$/, '');
const apiHost = new URL(apiBaseUrl).hostname;

const distDir = path.join(rootDir, 'dist');
for (const file of fs.readdirSync(distDir)) {
  if (!file.endsWith('.js')) continue;

  const filePath = path.join(distDir, file);
  const contents = fs
    .readFileSync(filePath, 'utf8')
    .replaceAll('__API_BASE_URL__', apiBaseUrl)
    .replaceAll('__API_HOST__', apiHost);

  fs.writeFileSync(filePath, contents);
}
