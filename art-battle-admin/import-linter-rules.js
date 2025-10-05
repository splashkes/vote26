#!/usr/bin/env node

/**
 * Import Event Linter Rules from YAML to Database
 *
 * Reads eventLinterRules.yaml and imports all rules into event_linter_rules table
 */

import fs from 'fs';
import yaml from 'yaml';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzcmhrd2Jnexxd3B5dmZsdG5yZiIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE2OTY3NjkxMTEsImV4cCI6MjAxMjM0NTExMX0.VGcME1OE93fLfdE-3bUH6TQwG0ULvW0IvusKlVP0QNw';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function importRules() {
  console.log('📖 Reading eventLinterRules.yaml...');

  const yamlContent = fs.readFileSync('public/eventLinterRules.yaml', 'utf8');
  const config = yaml.parse(yamlContent);

  if (!config.rules || !Array.isArray(config.rules)) {
    console.error('❌ No rules found in YAML file');
    process.exit(1);
  }

  console.log(`📋 Found ${config.rules.length} rules to import\n`);

  let imported = 0;
  let updated = 0;
  let errors = 0;

  for (const rule of config.rules) {
    try {
      const dbRule = {
        rule_id: rule.id,
        name: rule.name,
        description: rule.description || '',
        severity: rule.severity,
        category: rule.category,
        context: rule.context,
        conditions: rule.conditions || [],
        message: rule.message,
        status: 'active'
      };

      // Try to upsert (insert or update)
      const { data, error } = await supabase
        .from('event_linter_rules')
        .upsert(dbRule, {
          onConflict: 'rule_id',
          ignoreDuplicates: false
        })
        .select();

      if (error) {
        console.error(`❌ Error importing rule ${rule.id}:`, error.message);
        errors++;
      } else {
        // Check if it was an insert or update
        const { data: existing } = await supabase
          .from('event_linter_rules')
          .select('created_at, updated_at')
          .eq('rule_id', rule.id)
          .single();

        if (existing && existing.created_at === existing.updated_at) {
          console.log(`✅ Imported: ${rule.id} - ${rule.name}`);
          imported++;
        } else {
          console.log(`🔄 Updated: ${rule.id} - ${rule.name}`);
          updated++;
        }
      }
    } catch (err) {
      console.error(`❌ Exception importing rule ${rule.id}:`, err.message);
      errors++;
    }
  }

  console.log('\n📊 Import Summary:');
  console.log(`   ✅ Imported: ${imported}`);
  console.log(`   🔄 Updated: ${updated}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log(`   📋 Total: ${config.rules.length}`);
}

importRules().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
