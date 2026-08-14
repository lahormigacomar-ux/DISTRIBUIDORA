const axios = require('axios');
async function check() {
    try {
        const fRes = await axios.get('http://localhost:5000/api/families');
        console.log('Families first item keys:', Object.keys(fRes.data[0] || {}));

        const vRes = await axios.get('http://localhost:5000/api/products/variants');
        if (vRes.data && vRes.data.length > 0) {
            console.log('Variants first item keys:', Object.keys(vRes.data[0]));
        } else {
            console.log('No variants found');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}
check();
