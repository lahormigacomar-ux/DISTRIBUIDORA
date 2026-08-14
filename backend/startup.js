const supabase = require('./server').supabase || require('@supabase/supabase-js').createClient(
    process.env.SUPABASE_URL || 'https://uryrgktzejjxjngzizgh.supabase.co',
    process.env.SUPABASE_KEY || 'sb_publishable_aVojxqDFDh7hgPdTTybfuw_8M27_U_M'
);

async function autoCreateDefaultVariants() {
    try {
        console.log('Checking for orphan products (products without variants)...');
        const { data: products, error: pError } = await supabase.from('products').select('id, name');
        if (pError) throw pError;

        const { data: variants, error: vError } = await supabase.from('product_variants').select('product_id');
        if (vError) throw vError;

        const productIdsWithVariants = new Set(variants.map(v => v.product_id));
        const orphanProducts = products.filter(p => !productIdsWithVariants.has(p.id));

        if (orphanProducts.length > 0) {
            console.log(`Found ${orphanProducts.length} orphan products. Auto-creating default variants...`);
            const defaultVariants = orphanProducts.map(p => ({
                product_id: p.id,
                name: 'ÚNICO',
                code: '-',
                stock: 0,
                base_price: 0,
                price_unit: 0,
                price_bulk: 0,
                price_business: 0,
                price_company: 0,
                is_active: true
            }));

            const { error: insertError } = await supabase.from('product_variants').insert(defaultVariants);
            if (insertError) throw insertError;
            console.log('Successfully created default variants for all orphan products!');
        } else {
            console.log('No orphan products found.');
        }
    } catch (err) {
        console.error('Error in autoCreateDefaultVariants:', err);
    }
}

module.exports = { autoCreateDefaultVariants };
