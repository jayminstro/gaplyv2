import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from './config';

const supabaseUrl = `https://${supabaseConfig.projectId}.supabase.co`;

export const supabase = createClient(supabaseUrl, supabaseConfig.publicAnonKey);