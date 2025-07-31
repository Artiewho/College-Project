#!/usr/bin/env tsx

import axios from 'axios';

async function runComprehensiveScrape() {
  console.log('🚀 Starting comprehensive Course Critique scraping...');
  console.log('This will take several hours to complete.');
  console.log('The scraper will:');
  console.log('1. Extract all departments from Course Critique');
  console.log('2. Scrape every course in each department');
  console.log('3. Extract professor data and GPA information');
  console.log('4. Generate ChatGPT analysis for optimal course selection');
  console.log('5. Save all data locally for future use');
  console.log('');
  
  try {
    const response = await axios.post('http://localhost:3000/api/comprehensive-scraper', {
      action: 'scrape-all'
    }, {
      timeout: 0 // No timeout for long-running operation
    });
    
    if (response.data.success) {
      console.log('✅ Comprehensive scraping completed successfully!');
      console.log(`📊 Total courses scraped: ${response.data.data.totalCourses}`);
      console.log(`👨‍🏫 Total professors found: ${response.data.data.totalProfessors}`);
      console.log(`🏫 Departments covered: ${response.data.data.departments.join(', ')}`);
      console.log(`💾 Data saved to: ${response.data.data.filePath}`);
      console.log('');
      console.log('📋 Analysis Preview:');
      console.log(response.data.data.analysis);
    } else {
      console.error('❌ Scraping failed:', response.data.error);
    }
    
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('❌ Request failed:', error.response?.data || error.message);
    } else {
      console.error('❌ Unexpected error:', error);
    }
  }
}

// Check if data files exist
async function checkExistingData() {
  try {
    const response = await axios.get('http://localhost:3000/api/comprehensive-scraper');
    
    if (response.data.availableDataFiles?.length > 0) {
      console.log('📁 Found existing data files:');
      response.data.availableDataFiles.forEach((file: string) => {
        console.log(`  - ${file}`);
      });
      console.log('');
      
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise<string>((resolve) => {
        readline.question('Do you want to scrape new data or use existing? (new/existing): ', resolve);
      });
      
      readline.close();
      
      if (answer.toLowerCase() === 'existing') {
        console.log('Using existing data files.');
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.log('No existing data found. Starting fresh scrape.');
    return true;
  }
}

async function main() {
  const shouldScrape = await checkExistingData();
  
  if (shouldScrape) {
    await runComprehensiveScrape();
  }
}

if (require.main === module) {
  main().catch(console.error);
}