const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkProducts() {
    console.log("Checking products...");
    const { data, count, error } = await supabase.from('products').select('*', { count: 'exact' });
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Count:", count);
        if (data && data.length > 0) {
            console.log("First product name:", data[0].name);
        } else {
            console.log("No products found in database.");
        }
    }
}

checkProducts();
