#!/usr/bin/env node

/**
 * Copy bundle script for LTV Assistant MCP Server
 *
 * Copies the bundled MCP server to the API Gateway's public directory
 * for distribution via the download endpoint.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { copyFileSync, mkdirSync, existsSync, statSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const projectRoot = join(rootDir, '..');

// Paths
const bundlePath = join(rootDir, 'dist', 'mcp-server-bundle.js');
const apiGatewayPublicDir = join(projectRoot, 'api-gateway', 'public');
const targetPath = join(apiGatewayPublicDir, 'ltv-assistant-mcp-server.js');

console.log('Copying MCP server bundle to API Gateway...');

try {
  // Check if bundle exists
  if (!existsSync(bundlePath)) {
    throw new Error(`Bundle not found at ${bundlePath}. Run 'npm run build' first.`);
  }

  // Create api-gateway/public directory if it doesn't exist
  if (!existsSync(apiGatewayPublicDir)) {
    console.log('Creating api-gateway/public directory...');
    mkdirSync(apiGatewayPublicDir, { recursive: true });
  }

  // Copy bundle
  copyFileSync(bundlePath, targetPath);

  // Log success
  const stats = statSync(targetPath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log('✓ Bundle copied successfully');
  console.log(`  From: ${bundlePath}`);
  console.log(`  To:   ${targetPath}`);
  console.log(`  Size: ${sizeMB} MB`);
} catch (error) {
  console.error('✗ Copy failed:', error.message);
  process.exit(1);
}
