'use client';

import { useState } from 'react';

export default function ScrapePage() {
  const [isScrapingAll, setIsScrapingAll] = useState(false);
  const [scrapingProgress, setScrapingProgress] = useState('');
  const [scrapingResults, setScrapingResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const startComprehensiveScraping = async () => {
    setIsScrapingAll(true);
    setError(null);
    setScrapingProgress('Initializing comprehensive scraping...');
    
    try {
      const response = await fetch('/api/comprehensive-scraper', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'scrape-all' }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setScrapingResults(data.data);
        setScrapingProgress('Comprehensive scraping completed successfully!');
      } else {
        throw new Error(data.error || 'Scraping failed');
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setScrapingProgress('Scraping failed');
    } finally {
      setIsScrapingAll(false);
    }
  };

  const checkExistingData = async () => {
    try {
      const response = await fetch('/api/comprehensive-scraper');
      const data = await response.json();
      
      if (data.availableDataFiles?.length > 0) {
        alert(`Found ${data.availableDataFiles.length} existing data files:\n${data.availableDataFiles.join('\n')}`);
      } else {
        alert('No existing data files found.');
      }
    } catch (err) {
      setError('Failed to check existing data');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            Course Critique Comprehensive Scraper
          </h1>
          
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-blue-900 mb-4">
                What This Scraper Does
              </h2>
              <ul className="list-disc list-inside space-y-2 text-blue-800">
                <li>Extracts ALL courses from Course Critique</li>
                <li>Scrapes professor data and GPA information for every course</li>
                <li>Organizes data by department and course difficulty</li>
                <li>Generates ChatGPT analysis for optimal course selection</li>
                <li>Saves comprehensive data locally for future use</li>
                <li>Provides accurate, up-to-date information for schedule planning</li>
              </ul>
            </div>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-yellow-900 mb-4">
                ⚠️ Important Notes
              </h2>
              <ul className="list-disc list-inside space-y-2 text-yellow-800">
                <li>This process will take 2-4 hours to complete</li>
                <li>It will scrape thousands of courses and professor profiles</li>
                <li>Please ensure stable internet connection</li>
                <li>Data will be saved locally and can be reused</li>
                <li>Run this during off-peak hours to avoid rate limiting</li>
              </ul>
            </div>
            
            <div className="flex space-x-4">
              <button
                onClick={startComprehensiveScraping}
                disabled={isScrapingAll}
                className={`px-6 py-3 rounded-lg font-semibold ${
                  isScrapingAll
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                } text-white transition-colors`}
              >
                {isScrapingAll ? 'Scraping in Progress...' : 'Start Comprehensive Scraping'}
              </button>
              
              <button
                onClick={checkExistingData}
                className="px-6 py-3 rounded-lg font-semibold bg-green-600 hover:bg-green-700 text-white transition-colors"
              >
                Check Existing Data
              </button>
            </div>
            
            {scrapingProgress && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-2">Progress:</h3>
                <p className="text-gray-700">{scrapingProgress}</p>
                
                {isScrapingAll && (
                  <div className="mt-4">
                    <div className="animate-pulse flex space-x-4">
                      <div className="rounded-full bg-blue-400 h-3 w-3"></div>
                      <div className="flex-1 space-y-2 py-1">
                        <div className="h-2 bg-blue-400 rounded w-3/4"></div>
                        <div className="h-2 bg-blue-400 rounded w-1/2"></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="font-semibold text-red-900 mb-2">Error:</h3>
                <p className="text-red-700">{error}</p>
              </div>
            )}
            
            {scrapingResults && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <h3 className="font-semibold text-green-900 mb-4">Scraping Results:</h3>
                <div className="grid grid-cols-2 gap-4 text-green-800">
                  <div>
                    <p><strong>Total Courses:</strong> {scrapingResults.totalCourses}</p>
                    <p><strong>Total Professors:</strong> {scrapingResults.totalProfessors}</p>
                  </div>
                  <div>
                    <p><strong>Departments:</strong> {scrapingResults.departments?.length || 0}</p>
                    <p><strong>Data File:</strong> {scrapingResults.filePath?.split('/').pop() || 'N/A'}</p>
                  </div>
                </div>
                
                {scrapingResults.analysis && (
                  <div className="mt-4">
                    <h4 className="font-semibold text-green-900 mb-2">Analysis Preview:</h4>
                    <div className="bg-white p-4 rounded border text-gray-700 text-sm">
                      <pre className="whitespace-pre-wrap">{scrapingResults.analysis}</pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}