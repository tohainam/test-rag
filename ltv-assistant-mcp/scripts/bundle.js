#!/usr/bin/env node

/**
 * Bundle script for LTV Assistant MCP Server
 *
 * Uses esbuild to create a single-file bundle with all dependencies included.
 * The bundle is self-contained and can be distributed as a standalone executable.
 */

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, chmodSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Read package.json for version info
const packageJson = JSON.parse(
  readFileSync(join(rootDir, 'package.json'), 'utf-8')
);

const banner = `/**
 * LTV Assistant MCP Server - Bundled Version
 * Version: ${packageJson.version}
 * Generated: ${new Date().toISOString()}
 *
 * This is a self-contained bundle of the LTV Assistant MCP Server.
 * It includes all dependencies and can be run standalone without node_modules.
 */
`;

console.log('Building MCP server bundle...');
console.log(`Version: ${packageJson.version}`);

try {
  await esbuild.build({
    entryPoints: [join(rootDir, 'src', 'server.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: join(rootDir, 'dist', 'mcp-server-bundle.js'),
    minify: false, // Keep readable for debugging
    sourcemap: false,
    treeShaking: true,
    packages: 'bundle', // Bundle all node_modules
    banner: {
      js: banner,
    },
    logLevel: 'info',
  });

  // Make bundle executable on Unix systems
  try {
    const bundlePath = join(rootDir, 'dist', 'mcp-server-bundle.js');
    chmodSync(bundlePath, 0o755);
    console.log('✓ Made bundle executable');
  } catch (error) {
    // Ignore chmod errors on Windows
    console.warn('⚠ Could not make bundle executable (may not be supported on this platform)');
  }

  console.log('✓ Bundle created successfully');
  console.log(`  Output: dist/mcp-server-bundle.js`);

  // Log bundle size
  const { statSync } = await import('fs');
  const stats = statSync(join(rootDir, 'dist', 'mcp-server-bundle.js'));
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`  Size: ${sizeMB} MB`);

  if (stats.size > 10 * 1024 * 1024) {
    console.warn('⚠ Warning: Bundle size exceeds 10MB target');
  }
} catch (error) {
  console.error('✗ Bundle failed:', error);
  process.exit(1);
}
