const axios = require('axios');

async function testApi() {
    try {
        const res = await axios.get('http://localhost:5000/api/products');
        console.log('Status:', res.status);
        console.log('Is Array:', Array.isArray(res.data));
        console.log('Count:', res.data.length);
        if (res.data.length > 0) {
            console.log('First Item Keys:', Object.keys(res.data[0]));
        }
    } catch (err) {
        console.error('API Error:', err.message);
        if (err.response) {
            console.error('Data:', err.response.data);
        }
    }
}

testApi();
