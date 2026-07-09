require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../db/pool');

const REGIONS = ['us-east', 'us-west', 'eu-west', 'eu-central', 'ap-south', 'ap-southeast'];
const OS_LIST = ['Windows 11', 'Ubuntu 24.04', 'macOS Sonoma', 'iOS 18', 'Android 15'];
const COUNTRIES = [
  { country: 'United States', lat: 39.8, lng: -98.5 },
  { country: 'Germany', lat: 51.2, lng: 10.4 },
  { country: 'Brazil', lat: -14.2, lng: -51.9 },
  { country: 'Nigeria', lat: 9.1, lng: 8.7 },
  { country: 'Vietnam', lat: 14.1, lng: 108.3 },
  { country: 'Russia', lat: 61.5, lng: 105.3 },
  { country: 'India', lat: 20.6, lng: 78.9 },
  { country: 'Indonesia', lat: -0.8, lng: 113.9 },
];
const ALERT_TITLES = [
  ['Brute-force attempt · web-01.prod', 'HIGH', 'IDS'],
  ['New admin role granted · IAM', 'MEDIUM', 'IAM'],
  ['TLS cert renewed · api-gateway', 'LOW', 'PKI'],
  ['Outbound connection to flagged IP', 'HIGH', 'EDR'],
  ['Misconfigured S3 bucket detected', 'MEDIUM', 'Cloud Scanner'],
  ['Unusual login location for admin@org', 'MEDIUM', 'IAM'],
  ['Malware signature match on endpoint-14', 'CRITICAL', 'EDR'],
  ['Firewall rule changed outside change window', 'LOW', 'Network'],
];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Seeding database...');

    const orgResult = await client.query(
      `INSERT INTO organizations (name, security_score, risk_level) VALUES ($1, 87, 'Guarded') RETURNING *`,
      ['Secunova Demo Org']
    );
    const org = orgResult.rows[0];

    const passwordHash = await bcrypt.hash('DemoPass123!', 12);
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, name, role, organization_id)
       VALUES ($1, $2, $3, 'ADMIN', $4) RETURNING *`,
      ['demo@secunova.ai', passwordHash, 'Demo Admin', org.id]
    );
    const user = userResult.rows[0];

    for (let i = 0; i < 42; i++) {
      await client.query(
        `INSERT INTO devices (name, os, region, protected, organization_id) VALUES ($1,$2,$3,$4,$5)`,
        [`device-${String(i).padStart(3, '0')}`, rand(OS_LIST), rand(REGIONS), Math.random() > 0.05, org.id]
      );
    }

    for (const [title, severity, source] of ALERT_TITLES) {
      await client.query(
        `INSERT INTO alerts (title, severity, source, organization_id) VALUES ($1,$2,$3,$4)`,
        [title, severity, source, org.id]
      );
    }

    const incidents = [
      ['Brute-force campaign against SSH bastion', 'Automated login attempts from 3 IP ranges over 40 minutes.', 'HIGH', 'CONTAINED'],
      ['Exposed S3 bucket with public read access', 'Marketing assets bucket had public listing enabled.', 'MEDIUM', 'IN_REVIEW'],
      ['Malware detected on endpoint-14', 'Signature match for known trojan family; isolated automatically.', 'CRITICAL', 'IN_REVIEW'],
    ];
    for (const [title, description, severity, status] of incidents) {
      await client.query(
        `INSERT INTO incidents (title, description, severity, status, organization_id) VALUES ($1,$2,$3,$4,$5)`,
        [title, description, severity, status, org.id]
      );
    }

    const cloudAssets = [
      ['AWS', 96, 340],
      ['AZURE', 88, 210],
      ['GCP', 74, 96],
      ['ORACLE', 61, 22],
    ];
    for (const [provider, coverage, count] of cloudAssets) {
      await client.query(
        `INSERT INTO cloud_assets (provider, coverage_pct, resource_count, organization_id) VALUES ($1,$2,$3,$4)`,
        [provider, coverage, count, org.id]
      );
    }

    for (let i = 0; i < 300; i++) {
      const c = rand(COUNTRIES);
      const jitterLat = c.lat + (Math.random() - 0.5) * 6;
      const jitterLng = c.lng + (Math.random() - 0.5) * 6;
      const hoursAgo = Math.random() * 24;
      await client.query(
        `INSERT INTO threat_events (lat, lng, country, blocked, created_at)
         VALUES ($1,$2,$3,$4, now() - ($5 || ' hours')::interval)`,
        [jitterLat, jitterLng, c.country, Math.random() > 0.12, hoursAgo]
      );
    }

    console.log('Seed complete.');
    console.log('Demo login -> email: demo@secunova.ai / password: DemoPass123!');
    console.log(`Organization: ${org.name} (${org.id})`);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
