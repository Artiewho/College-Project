import axios from 'axios';

/**
 * Search the web using Google Custom Search API
 * @param query The search query
 * @param numResults Number of results to return (default: 5)
 * @returns Array of search results
 */
export async function searchWeb(query: string, numResults: number = 5) {
  try {
    // Google Custom Search API endpoint
    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        q: query,
        cx: process.env.GOOGLE_SEARCH_CX, // Your search engine ID
        key: process.env.GOOGLE_API_KEY,  // Your API key
        num: numResults
      }
    });
    
    // Format the results to a consistent structure
    if (response.data.items && response.data.items.length > 0) {
      return response.data.items.map((item: any) => ({
        name: item.title,
        snippet: item.snippet,
        url: item.link
      }));
    }
    
    return [];
  } catch (error) {
    console.error('Error searching the web:', error);
    return [];
  }
}