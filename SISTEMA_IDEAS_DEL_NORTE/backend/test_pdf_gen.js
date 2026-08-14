const axios = require('axios');

async function testPdf() {
    console.log('Sending PDF generation request...');
    try {
        const response = await axios.post('http://localhost:5000/api/catalog/pdf', {
            selectedProducts: [], // Empty to test general flow
            selectedFamilies: [],
            selectedGroups: []
        }, { responseType: 'arraybuffer' });
        console.log('Success! Received PDF buffer of size:', response.data.byteLength);
    } catch (err) {
        console.error('PDF Generation Failed!');
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Data:', err.response.data.toString());
        } else {
            console.error('Error Message:', err.message);
        }
    }
}

testPdf();
