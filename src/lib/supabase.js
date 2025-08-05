import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI2MDE4MDUsImV4cCI6MjA0ODE3NzgwNX0.r7WVmf0ViRtMqLEVT0tCYhHQfXEqPb6Yzx9dVP6lN0g';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);