import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://db.artb.art';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzcf_Fya3Viemdxd3B5dmZsdG5yZiIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzI2MDcxNjAwLCJleHAiOjIwNDE2NDc2MDB9.w-iqcNqRJvlYmlwPZxdmNdtqrBUfGqV4LJNvbm2Jc-8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
