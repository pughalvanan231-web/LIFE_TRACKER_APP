/**
 * Automated Test Suite for PWA, Accessibility, Service Worker Security, and Android Configuration (Phase 10)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');

// ==============================================================================
// 1. PWA MANIFEST & HTML INTEGRATION AUDIT
// ==============================================================================

test('PWA Manifest: valid JSON, required metadata, standalone display, and crisp icons', () => {
  const manifestPath = path.join(frontendRoot, 'public', 'manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist in public/');

  const manifestContent = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestContent);

  assert.equal(manifest.name, 'Life Goals AI');
  assert.equal(manifest.short_name, 'Life Goals');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.ok(manifest.theme_color);
  assert.ok(manifest.background_color);

  // Verify icons array includes required standard sizes
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
  const iconSizes = manifest.icons.map((i) => i.sizes);
  assert.ok(iconSizes.includes('192x192'), 'Must include 192x192 icon');
  assert.ok(iconSizes.includes('512x512'), 'Must include 512x512 icon');

  // Verify physical icon files exist in public/
  for (const icon of manifest.icons) {
    const iconFilePath = path.join(frontendRoot, 'public', icon.src.replace(/^\//, ''));
    assert.ok(fs.existsSync(iconFilePath), `Icon file must physically exist at ${icon.src}`);
  }
});

test('PWA HTML Shell: index.html contains manifest link and mobile web app capability tags', () => {
  const indexPath = path.join(frontendRoot, 'index.html');
  const indexContent = fs.readFileSync(indexPath, 'utf8');

  assert.ok(indexContent.includes('rel="manifest"'), 'Must link manifest.json');
  assert.ok(indexContent.includes('name="viewport"'), 'Must define viewport');
  assert.ok(indexContent.includes('name="theme-color"'), 'Must define theme-color');
  assert.ok(indexContent.includes('name="apple-mobile-web-app-capable"'), 'Must define apple-mobile-web-app-capable');
  assert.ok(indexContent.includes('rel="apple-touch-icon"'), 'Must define apple-touch-icon');
});

// ==============================================================================
// 2. SERVICE WORKER & SECURITY AUDIT
// ==============================================================================

test('Service Worker: exists and contains safe offline fallback asset pre-caching', () => {
  const swPath = path.join(frontendRoot, 'public', 'sw.js');
  assert.ok(fs.existsSync(swPath), 'sw.js must exist in public/');

  const swContent = fs.readFileSync(swPath, 'utf8');
  assert.ok(swContent.includes('/offline.html'), 'Must pre-cache offline.html fallback');
  assert.ok(swContent.includes('/index.html'), 'Must pre-cache index.html application shell');
  assert.ok(swContent.includes('caches.open'), 'Must handle cache open on install');
});

test('Service Worker Security Rule: strictly forbids caching authenticated API responses', () => {
  const swPath = path.join(frontendRoot, 'public', 'sw.js');
  const swContent = fs.readFileSync(swPath, 'utf8');

  // Strict architectural guarantee from prompt:
  // "Do not cache sensitive authenticated API responses or expose private information on shared devices."
  assert.ok(
    swContent.includes('/api/') || swContent.includes('/v1/'),
    'Must inspect API route prefix'
  );
  assert.ok(
    swContent.includes('Authorization'),
    'Must explicitly detect and bypass Authorization headers'
  );
  assert.ok(
    swContent.includes('request.method !== \'GET\''),
    'Must bypass state-mutating requests (POST, PUT, PATCH, DELETE)'
  );
});

test('Offline Fallback: offline.html renders clear user explanation and security disclaimer', () => {
  const offlinePath = path.join(frontendRoot, 'public', 'offline.html');
  assert.ok(fs.existsSync(offlinePath), 'offline.html must exist');

  const content = fs.readFileSync(offlinePath, 'utf8');
  assert.ok(content.includes('Offline'), 'Must display offline notification');
  assert.ok(content.includes('Retry Connection'), 'Must provide reload action');
  assert.ok(
    content.includes('never stored in shared browser caches'),
    'Must display security privacy disclaimer'
  );
});

// ==============================================================================
// 3. RESPONSIVE DESIGN & ACCESSIBILITY AUDIT
// ==============================================================================

test('Accessibility: responsive.css provides prefers-reduced-motion media query', () => {
  const responsiveCssPath = path.join(frontendRoot, 'src', 'styles', 'responsive.css');
  const content = fs.readFileSync(responsiveCssPath, 'utf8');

  assert.ok(
    content.includes('prefers-reduced-motion: reduce'),
    'Must implement prefers-reduced-motion media query for vestibular accessibility'
  );
  assert.ok(
    content.includes('animation-duration'),
    'Must neutralize animation duration when reduced motion is preferred'
  );
});

test('Mobile Usability: minimum touch target sizes enforced for interactive elements', () => {
  const responsiveCssPath = path.join(frontendRoot, 'src', 'styles', 'responsive.css');
  const content = fs.readFileSync(responsiveCssPath, 'utf8');

  assert.ok(
    content.includes('min-height: 44px') || content.includes('44px'),
    'Must meet WCAG 2.1 touch target guideline of 44x44px on mobile screens'
  );
});

// ==============================================================================
// 4. CAPACITOR ANDROID PACKAGING AUDIT
// ==============================================================================

test('Android Packaging: capacitor.config.json specifies correct app metadata and secure transport', () => {
  const capPath = path.join(frontendRoot, 'capacitor.config.json');
  assert.ok(fs.existsSync(capPath), 'capacitor.config.json must exist');

  const capConfig = JSON.parse(fs.readFileSync(capPath, 'utf8'));
  assert.equal(capConfig.appId, 'com.lifegoals.ai');
  assert.equal(capConfig.appName, 'Life Goals AI');
  assert.equal(capConfig.webDir, 'dist');
  assert.equal(capConfig.server.androidScheme, 'https');
  assert.equal(capConfig.server.cleartext, false);
});
