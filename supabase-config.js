const SUPABASE_URL = "https://pihipnybthcvnchixnpn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_lFX4mkGxjnU8hLUvmk_Qeg_aFfxU9IL";
window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
