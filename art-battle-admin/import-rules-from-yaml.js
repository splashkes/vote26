#!/usr/bin/env node

/**
 * Generate SQL INSERT statements from YAML rules
 */

import fs from 'fs';
import yaml from 'yaml';

const yamlContent = fs.readFileSync('public/eventLinterRules.yaml', 'utf8');
const config = yaml.parse(yamlContent);

console.log('-- Import Event Linter Rules');
console.log('-- Generated from eventLinterRules.yaml\n');

// Truncate existing rules (optional - comment out if you want to keep old rules)
console.log('-- Clear existing rules');
console.log('TRUNCATE event_linter_rules;');
console.log('');

for (const rule of config.rules) {
  const conditions = JSON.stringify(rule.conditions || []).replace(/'/g, "''");
  const message = rule.message.replace(/'/g, "''");
  const description = (rule.description || '').replace(/'/g, "''");
  const name = rule.name.replace(/'/g, "''");

  console.log(`INSERT INTO event_linter_rules (rule_id, name, description, severity, category, context, conditions, message, status) VALUES (
  '${rule.id}',
  '${name}',
  '${description}',
  '${rule.severity}',
  '${rule.category}',
  '${rule.context}',
  '${conditions}'::jsonb,
  '${message}',
  'active'
);
`);
}

console.log(`-- Total rules: ${config.rules.length}`);
