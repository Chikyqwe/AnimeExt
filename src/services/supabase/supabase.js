require('dotenv').config({ quiet: true });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fpltgmpbdukudlnjfqcf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwbHRnbXBiZHVrdWRsbmpmcWNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk1NDQyMywiZXhwIjoyMDg5NTMwNDIzfQ.gV-l-Y08CuJmcJ2pI0Br3T30h04zCz6pO5TMZAoR0P8'; // Usa service_role para control total

const supabase = createClient(supabaseUrl, supabaseKey);
module.exports = { supabase };