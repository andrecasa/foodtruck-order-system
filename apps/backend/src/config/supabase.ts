import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:8000';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** Client for public operations (login, etc.) */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** Client with elevated privileges for admin operations */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
