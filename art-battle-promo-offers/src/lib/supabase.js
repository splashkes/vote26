import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xsqdkubgyqwpyvfltnrf.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDQzMTU2MDAsImV4cCI6MjAxOTg5MTYwMH0.C9p0TZ8jqVL_qH_VYM0TdLZRKGVqYW6lW_JnJ4fQ3yI'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
})
