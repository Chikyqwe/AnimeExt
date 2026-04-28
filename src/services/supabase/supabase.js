require('dotenv').config({ quiet: true });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL; 
const supabaseKey = process.env.NEXT_PRIVATE_SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
module.exports = { supabase };