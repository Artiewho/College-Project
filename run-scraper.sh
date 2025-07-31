#!/bin/bash

echo "🚀 Starting Course Critique Comprehensive Scraper"
echo "=================================================="
echo ""
echo "This will:"
echo "1. Scrape ALL courses from Course Critique"
echo "2. Extract professor data and GPA information"
echo "3. Generate ChatGPT analysis for course selection"
echo "4. Save data locally for future use"
echo ""
echo "⚠️  This process will take 2-4 hours to complete"
echo "⚠️  Please ensure stable internet connection"
echo ""

read -p "Do you want to continue? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "Starting Next.js development server..."
    npm run dev &
    SERVER_PID=$!
    
    echo "Waiting for server to start..."
    sleep 10
    
    echo "Triggering comprehensive scraping..."
    curl -X POST http://localhost:3000/api/comprehensive-scraper \
         -H "Content-Type: application/json" \
         -d '{"action":"scrape-all"}' \
         --max-time 0
    
    echo "Stopping development server..."
    kill $SERVER_PID
    
    echo "✅ Scraping completed! Check the /data directory for results."
else
    echo "Scraping cancelled."
fi