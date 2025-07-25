require('dotenv').config({ path: '.env.local' });
const axios = require('axios');

async function testGoogleSearch() {
  try {
    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        q: 'test query',
        cx: process.env.GOOGLE_SEARCH_CX,
        key: process.env.GOOGLE_API_KEY,
        num: 1
      }
    });
    
    console.log('Google Search API is working!');
    console.log('Results:', response.data.items ? response.data.items.length : 0);
  } catch (error) {
    console.error('Google Search API Error:', error.response?.data?.error || error.message);
  }
}

testGoogleSearch();