#!/usr/bin/env node
/**
 * Auto-updates the "Latest projects" section of the profile README.
 *
 * Behaviour:
 *   - PUBLIC repos  -> rendered as linked project cards (name, description, stars, language).
 *   - PRIVATE repos -> skipped by default. If SHOW_PRIVATE=true AND a GH_PAT secret with
 *                      `repo` scope is provided, they are listed as plain "gist-style" text
 *                      (name + description only, NO link), so nothing private is exposed.
 *
 * The section is written between the <!-- PROJECTS:START --> / <!-- PROJECTS:END --> markers.
 *
 * Requires Node 18+ (uses the built-in global fetch). No external dependencies.
 */

const fs = require('fs');
const path = require('path');

const USERNAME = process.env.GH_USERNAME || 'Rishav1995-roy';
const SHOW_PRIVATE = String(process.env.SHOW_PRIVATE || 'false').toLowerCase() === 'true';
const PAT = process.env.GH_PAT || '';
const TOKEN = process.env.GITHUB_TOKEN || '';
const MAX_PROJECTS = Number(process.env.MAX_PROJECTS || 6);
const README_PATH = path.resolve(__dirname, '..', 'README.md');

const START = '<!-- PROJECTS:START -->';
const END = '<!-- PROJECTS:END -->';

/**
 * Curated one-line descriptions. These take precedence over the GitHub
 * description so featured repos read cleanly even when GitHub has none.
 * Add a repo name here any time you want to control how it's presented.
 */
const OVERRIDES = {
  flicktvassignment:
    'Cinematic wallet intro screen in pure Flutter - CustomPainter animations, confetti & a 3D wallet, zero third-party packages.',
  'Local-Listings-Reviews-Engine':
    'Production-ready REST API to discover & review local places - Node.js/TS/Express/PostgreSQL with AI review moderation (BullMQ), pg_trgm dedupe, ranked feeds & S3 uploads.',
  ecom_demo_project:
    'Cross-platform e-commerce app in Flutter - product catalog, browsing & cart flows running on mobile, web and desktop.',
  'expanse-tracker':
    'Cross-platform expense tracker in Flutter - log, categorize & visualize spending across mobile, web and desktop.',
  auto_height_webview:
    'Flutter package that auto-sizes a WebView to its HTML content on iOS, Android & Web - JS injection with live content-change detection.',
  'object-detection':
    'Real-time object detection in Flutter using native ML Kit via platform channels - no third-party detection packages.',
  'demo-product-app':
    'Product showcase app - browse, search and favorite products.',
  carasouel:
    'Flutter dating app - swipeable profile cards, Google Sign-In auth and a saved-favorites section.',
  'freelance-demo':
    'Cross-platform Flutter app built for a freelance client engagement.',
  sitter:
    'Flutter mobile app (iOS/Android) with native Swift & Kotlin integration.',
  wokk_final_build_client:
    'Production client build delivered for the Wokk project (Java / Android).',
  ZivameApplication: 'Native Android application built with Kotlin.',
};

async function gh(url, token) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': USERNAME,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} for ${url}: ${await res.text()}`);
  }
  return res.json();
}

/** Public repos owned by the user, most recently pushed first. */
async function getPublicRepos() {
  const repos = await gh(
    `https://api.github.com/users/${USERNAME}/repos?per_page=100&sort=pushed&type=owner`,
    TOKEN
  );
  return repos
    .filter((r) => !r.fork && !r.archived && r.name.toLowerCase() !== USERNAME.toLowerCase())
    .filter((r) => !r.private);
}

/** Private repos owned by the user (only when explicitly enabled with a PAT). */
async function getPrivateRepos() {
  if (!SHOW_PRIVATE || !PAT) return [];
  try {
    const repos = await gh(
      'https://api.github.com/user/repos?per_page=100&sort=pushed&affiliation=owner&visibility=private',
      PAT
    );
    return repos.filter((r) => !r.fork && !r.archived);
  } catch (err) {
    console.warn(`Skipping private repos: ${err.message}`);
    return [];
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

function publicCard(repo) {
  const desc = escapeHtml(OVERRIDES[repo.name] || repo.description || 'No description provided.');
  const lang = repo.language ? `\`${repo.language}\`` : '';
  const meta = [lang, `⭐ ${repo.stargazers_count}`, `🍴 ${repo.forks_count}`]
    .filter(Boolean)
    .join(' · ');
  return `#### [${repo.name}](${repo.html_url})\n${desc}\n\n<sub>${meta}</sub>`;
}

function privateLine(repo) {
  // Gist-style: name + description ONLY, no link, no metadata that exposes the repo.
  const desc = escapeHtml(repo.description || 'Private work in progress.');
  return `- 🔒 **${escapeHtml(repo.name)}** — ${desc} <sub>(private)</sub>`;
}

function buildSection(publicRepos, privateRepos) {
  const lines = ['<!-- This section is generated automatically. Do not edit by hand. -->', ''];

  const top = publicRepos.slice(0, MAX_PROJECTS);
  if (top.length) {
    lines.push('<table><tr>');
    top.forEach((repo, i) => {
      lines.push('<td valign="top" width="50%">');
      lines.push('');
      lines.push(publicCard(repo));
      lines.push('');
      lines.push('</td>');
      if (i % 2 === 1 && i !== top.length - 1) lines.push('</tr><tr>');
    });
    lines.push('</tr></table>');
  } else {
    lines.push('_New projects landing soon — watch this space._');
  }

  if (privateRepos.length) {
    lines.push('');
    lines.push('<details><summary><b>🔒 Other work (private)</b></summary>');
    lines.push('');
    privateRepos.slice(0, 10).forEach((r) => lines.push(privateLine(r)));
    lines.push('');
    lines.push('</details>');
  }

  lines.push('');
  lines.push(
    `<sub>Last updated: ${new Date().toISOString().slice(0, 10)} · auto-generated from public repositories.</sub>`
  );
  return lines.join('\n');
}

async function main() {
  const [publicRepos, privateRepos] = await Promise.all([getPublicRepos(), getPrivateRepos()]);
  const section = buildSection(publicRepos, privateRepos);

  const readme = fs.readFileSync(README_PATH, 'utf8');
  const startIdx = readme.indexOf(START);
  const endIdx = readme.indexOf(END);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('Could not find PROJECTS markers in README.md');
  }

  const before = readme.slice(0, startIdx + START.length);
  const after = readme.slice(endIdx);
  const next = `${before}\n${section}\n${after}`;

  if (next === readme) {
    console.log('README already up to date.');
    return;
  }
  fs.writeFileSync(README_PATH, next);
  console.log(`Updated README with ${publicRepos.length} public + ${privateRepos.length} private repos.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
