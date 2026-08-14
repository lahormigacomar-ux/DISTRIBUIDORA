const axios = require('axios');

async function checkFormats() {
    try {
        const res = await axios.get('http://localhost:5000/api/products');
        console.log('Product Formats:');
        res.data.forEach(p => {
            console.log(`- ${p.name}: ${p.pdf_format || '1'} (Variants: ${p.product_variants?.length || 0})`);
        });
    } catch (err) {
        console.error('Error:', err.message);
    }
}

checkFormats();
