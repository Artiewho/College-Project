import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { extractCourseCode, formatProfessorData, generateSemesterSequence } from '../../utils/professorData';
import { searchWeb } from '../../utils/searchApi';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Extract course codes from a prompt
function extractCoursesFromPrompt(prompt: string): string[] {
  // Match common course code patterns (e.g., CS 1301, MATH 2551)
  const courseRegex = /([A-Z]{2,4})\s*(\d{4})/gi;
  const matches = [...prompt.matchAll(courseRegex)];
  return matches.map(match => match[0]);
}

// Get professor data for courses
async function getProfessorData(university: string, courses: string[]) {
  const professorDataMap = new Map();
  
  // Get the base URL from environment variables or use a default
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
  
  for (const course of courses) {
    try {
      const response = await fetch('/api/scraper', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          university,
          course,
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        // Fix: Use allProfessors instead of professors
        if (data.allProfessors && data.allProfessors.length > 0) {
          professorDataMap.set(course, data.allProfessors);
        }
      }
    } catch (error) {
      console.error(`Error fetching professor data for ${course}:`, error);
    }
  }
  
  return professorDataMap;
}

// Extract university from the prompt (improved approach)
function extractUniversityFromPrompt(prompt: string): string {
  // Look for common patterns indicating a university
  const universityPatterns = [
    /at\s+([\w\s]+(?:University|College|Institute|Tech))/i,
    /([\w\s]+(?:University|College|Institute|Tech))\s+student/i,
    /([\w\s]+(?:University|College|Institute|Tech))\s+courses/i,
    /studying\s+at\s+([\w\s]+(?:University|College|Institute|Tech))/i
  ];
  
  for (const pattern of universityPatterns) {
    const match = prompt.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return '';
}

// New function to search for major requirements with better categorization
async function getMajorRequirements(university: string, major: string): Promise<string> {
  if (!university || !major) {
    return '';
  }
  
  try {
    // Search for major requirements with explicit focus on required vs elective courses
    const searchQuery = `${major} major required courses vs electives curriculum ${university}`;
    const searchResults = await searchWeb(searchQuery, 5);
    
    if (searchResults.length === 0) {
      return '';
    }
    
    // Format the search results into a clearly structured summary
    let requirementsInfo = `\n\nMajor Requirements for ${major} at ${university}:\n`;
    requirementsInfo += `\n### REQUIRED COURSES (MUST be included in schedule):\n`;
    
    // Process search results to identify required vs elective courses
    let requiredCoursesText = '';
    let electiveCoursesText = '';
    
    searchResults.forEach((result) => {
      const snippet = result.snippet;
      
      // Look for patterns indicating required courses
      if (snippet.match(/required|core|mandatory|must take|prerequisite/i)) {
        requiredCoursesText += `- ${snippet}\n`;
      }
      // Look for patterns indicating elective courses
      else if (snippet.match(/elective|optional|choose from|select from/i)) {
        electiveCoursesText += `- ${snippet}\n`;
      }
      // If no clear indicator, add to both sections to ensure coverage
      else {
        requiredCoursesText += `- ${snippet}\n`;
        electiveCoursesText += `- ${snippet}\n`;
      }
    });
    
    // Add the categorized content
    requirementsInfo += requiredCoursesText || '- No specific required courses found in search results. Please verify with the university catalog.\n';
    
    requirementsInfo += `\n### ELECTIVE COURSES (Choose based on HIGHEST GPA):\n`;
    requirementsInfo += electiveCoursesText || '- No specific elective courses found in search results. Please verify with the university catalog.\n';
    
    requirementsInfo += '\n**CRITICAL INSTRUCTION: ALL required courses MUST be included in the schedule for graduation. For elective courses, ALWAYS choose those with the HIGHEST GPA.**\n';
    
    return requirementsInfo;
  } catch (error) {
    console.error('Error searching for major requirements:', error);
    return '';
  }
}

// New function to find the best free electives based on GPA
async function getBestFreeElectives(university: string): Promise<string> {
  if (!university) {
    return '';
  }
  
  try {
    // Launch browser to scrape Course Critique for free electives
    const browser = await chromium.launch({
      headless: true,
      args: ['--disable-gpu', '--disable-dev-shm-usage', '--disable-setuid-sandbox', '--no-sandbox']
    });
    
    let electiveInfo = '';
    
    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        viewport: { width: 1280, height: 720 }
      });
      
      const page = await context.newPage();
      
      // For Georgia Tech, we can search for common free elective courses
      // This list can be expanded based on the university
      const freeElectiveCourses = [
        'APPH 1040', // Health
        'APPH 1050', // Science of Physical Activity
        'PSYC 1101', // General Psychology
        'ECON 2100', // Economic Analysis
        'ECON 2101', // The Global Economy
        'INTA 1200', // American Government
        'HTS 2100', // Science and Technology in the Modern World
        'LMC 3403', // Technical Communication
        'CS 1301', // Intro to Computing
        'CS 1315', // Media Computation
        'MGT 3000', // Financial & Managerial Accounting
        'MGT 3300', // Marketing Management
      ];
      
      electiveInfo = '\n\nBest Free Electives (Sorted by Highest GPA):\n';
      
      const electiveData = [];
      
      // Fetch GPA data for each elective course
      for (const course of freeElectiveCourses) {
        const professors = await getCourseCritiqueProfessors(course);
        
        if (professors.length > 0) {
          // Calculate average GPA for the course across all professors
          const totalGPA = professors.reduce((sum, prof) => sum + prof.avgGPA, 0);
          const avgGPA = totalGPA / professors.length;
          
          electiveData.push({
            course,
            avgGPA,
            bestProfessor: professors[0] // Already sorted by highest GPA
          });
        }
      }
      
      // Sort electives by highest average GPA
      electiveData.sort((a, b) => b.avgGPA - a.avgGPA);
      
      // Format the elective information
      electiveData.forEach((elective, index) => {
        electiveInfo += `${index + 1}. ${elective.course} - Average GPA: ${elective.avgGPA.toFixed(2)}\n`;
        electiveInfo += `   Best Professor: ${elective.bestProfessor.name} (GPA: ${elective.bestProfessor.avgGPA.toFixed(2)})\n`;
      });
      
      electiveInfo += '\nIMPORTANT: Choose the free elective with the highest GPA to maximize your GPA.\n';
    } finally {
      await browser.close();
    }
    
    return electiveInfo;
  } catch (error) {
    console.error('Error finding best free electives:', error);
    return '\nCould not retrieve free elective information. Please check Course Critique manually for the highest GPA electives.\n';
  }
}

// New function to get core/general education requirements
async function getCoreEducationRequirements(university: string): Promise<string> {
  if (!university) {
    return '';
  }
  
  try {
    // Search for core curriculum requirements
    const searchQuery = `${university} core curriculum general education requirements`;
    const searchResults = await searchWeb(searchQuery, 5);
    
    if (searchResults.length === 0) {
      return '';
    }
    
    // Format the search results into a structured summary
    let coreRequirementsInfo = `\n\nCORE/GENERAL EDUCATION REQUIREMENTS for ${university}:\n`;
    coreRequirementsInfo += `\n### CORE CURRICULUM (REQUIRED for ALL students regardless of major):\n`;
    
    // Process search results to identify core curriculum components
    let foundCommunication = false;
    let foundMathematics = false;
    let foundSciences = false;
    let foundHumanities = false;
    let foundSocialSciences = false;
    let foundHistory = false;
    
    let communicationText = '';
    let mathematicsText = '';
    let sciencesText = '';
    let humanitiesText = '';
    let socialSciencesText = '';
    let historyText = '';
    let otherRequirementsText = '';
    
    searchResults.forEach((result) => {
      const snippet = result.snippet;
      
      // Look for patterns indicating different core curriculum areas
      if (snippet.match(/communication|writing|english comp|composition|rhetoric/i)) {
        foundCommunication = true;
        communicationText += `- ${snippet}\n`;
      }
      if (snippet.match(/math|mathematics|algebra|calculus|statistics/i)) {
        foundMathematics = true;
        mathematicsText += `- ${snippet}\n`;
      }
      if (snippet.match(/science|biology|chemistry|physics|natural|life and physical/i)) {
        foundSciences = true;
        sciencesText += `- ${snippet}\n`;
      }
      if (snippet.match(/humanities|literature|philosophy|language|arts/i)) {
        foundHumanities = true;
        humanitiesText += `- ${snippet}\n`;
      }
      if (snippet.match(/social|behavioral|psychology|sociology|economics/i)) {
        foundSocialSciences = true;
        socialSciencesText += `- ${snippet}\n`;
      }
      if (snippet.match(/history|american history|us history/i)) {
        foundHistory = true;
        historyText += `- ${snippet}\n`;
      }
      
      // Catch other requirements that don't fit the categories above
      if (!snippet.match(/communication|math|science|humanities|social|history/i)) {
        otherRequirementsText += `- ${snippet}\n`;
      }
    });
    
    // Add the categorized content
    if (foundCommunication) {
      coreRequirementsInfo += `\n#### Communication/Writing Requirements:\n${communicationText}`;
    }
    if (foundMathematics) {
      coreRequirementsInfo += `\n#### Mathematics Requirements:\n${mathematicsText}`;
    }
    if (foundSciences) {
      coreRequirementsInfo += `\n#### Science Requirements:\n${sciencesText}`;
    }
    if (foundHumanities) {
      coreRequirementsInfo += `\n#### Humanities/Literature/Arts Requirements:\n${humanitiesText}`;
    }
    if (foundSocialSciences) {
      coreRequirementsInfo += `\n#### Social/Behavioral Sciences Requirements:\n${socialSciencesText}`;
    }
    if (foundHistory) {
      coreRequirementsInfo += `\n#### History Requirements:\n${historyText}`;
    }
    if (otherRequirementsText) {
      coreRequirementsInfo += `\n#### Other Core Requirements:\n${otherRequirementsText}`;
    }
    
    coreRequirementsInfo += '\n**CRITICAL INSTRUCTION: ALL students MUST complete these core/general education requirements regardless of major. These courses MUST be included in the schedule.**\n';
    
    return coreRequirementsInfo;
  } catch (error) {
    console.error('Error searching for core education requirements:', error);
    return '';
  }
}

// Replace the existing POST function with this updated version

export async function POST(request: NextRequest) {
  try {
    const { prompt, major, university } = await request.json();
    
    // Define the functions that can be called
    const functions = [
      {
        name: "google_for_answers",
        description: "Search Google with a query to enhance knowledge.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query to send to Google"
            }
          },
          required: ["query"]
        }
      }
    ];
    
    // Check if we should use the new function calling approach
    if (process.env.ENABLE_WEB_SEARCH === 'true') {
      // Make the initial API call with function definitions
      const response = await openai.chat.completions.create({
        model: "gpt-4", // or your preferred model
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: prompt }
        ],
        functions: functions,
        function_call: "auto"
      });
      
      // Check if the model wants to call a function
      const responseMessage = response.choices[0].message;
      
      if (responseMessage.function_call) {
        // The model wants to search the web
        const functionName = responseMessage.function_call.name;
        const functionArgs = JSON.parse(responseMessage.function_call.arguments);
        
        if (functionName === "google_for_answers") {
          // Perform the web search
          const searchResults = await searchWeb(functionArgs.query);
          
          // Send the search results back to the model
          const secondResponse = await openai.chat.completions.create({
            model: "gpt-4", // or your preferred model
            messages: [
              { role: "system", content: "You are a helpful assistant." },
              { role: "user", content: prompt },
              responseMessage,
              { 
                role: "function", 
                name: "google_for_answers", 
                content: JSON.stringify(searchResults)
              }
            ]
          });
          
          // Return the final response
          return NextResponse.json({
            response: secondResponse.choices[0].message.content,
            usedWebSearch: true
          });
        }
      }
      
      // If no function was called, return the original response
      return NextResponse.json({
        response: responseMessage.content,
        usedWebSearch: false
      });
    }
    
    // Continue with the existing implementation if web search is not enabled
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }
    
    // Extract university from the prompt if not provided explicitly
    const extractedUniversity = university || extractUniversityFromPrompt(prompt);
    console.log(`University: ${extractedUniversity}`);
    
    // Extract course codes from the prompt
    const courses = extractCoursesFromPrompt(prompt);
    console.log(`Extracted courses: ${courses.join(', ')}`);
    
    // Get professor data for the courses if university is specified
    let professorDataMap = new Map();
    if (extractedUniversity && courses.length > 0) {
      professorDataMap = await getProfessorData(extractedUniversity, courses);
    }
    
    // Get major requirements if major and university are specified
    let majorRequirements = '';
    if (major && extractedUniversity) {
      console.log(`Searching for ${major} requirements at ${extractedUniversity}`);
      majorRequirements = await getMajorRequirements(extractedUniversity, major);
    }
    
    // Get core education requirements if university is specified
    let coreRequirements = '';
    if (extractedUniversity) {
      console.log(`Searching for core curriculum requirements at ${extractedUniversity}`);
      coreRequirements = await getCoreEducationRequirements(extractedUniversity);
    }
    
    // Generate semester sequence starting from current year (2025)
    // Don't include summer semesters by default
    const semesters = generateSemesterSequence(8, false); // Generate 8 semesters (4 years) without summer
    
    // Prepare additional context for OpenAI based on scraped data and semester information
    let additionalContext = '';
    
    // Add semester information
    additionalContext += '\n\nIMPORTANT: Use ONLY the following semesters in your schedule, starting from the current year (2025):\n';
    semesters.forEach(semester => {
      additionalContext += `- ${semester}\n`;
    });
    additionalContext += '\nDo NOT use any semesters from previous years. The current year is 2025.\n';
    
    // Add core curriculum requirements if available
    if (coreRequirements) {
      additionalContext += coreRequirements;
    }
    
    // Add major requirements information if available with stronger emphasis on required vs elective distinction
    if (majorRequirements) {
      additionalContext += majorRequirements;
      additionalContext += '\n**CRITICAL INSTRUCTION: Make sure to include ALL the REQUIRED courses for this major in the schedule. These are MANDATORY for graduation. For ELECTIVE courses, always choose those with the HIGHEST GPA.**\n';
      additionalContext += '\n**VERIFICATION STEP: Before finalizing your schedule, verify that ALL required courses are included.**\n';
    }
    
    // Add professor information if available with stronger emphasis on school-specific professors
    if (professorDataMap.size > 0) {
      // Special handling for Georgia Tech
      if (extractedUniversity.toLowerCase().includes('georgia tech')) {
        additionalContext += `\nHere is information about professors for the requested courses at Georgia Tech, prioritized by highest GPA:\n`;
        
        for (const [course, professors] of professorDataMap.entries()) {
          additionalContext += `\n${course}:\n`;
          if (professors.length > 0) {
            // For Georgia Tech, emphasize that these are sorted by GPA
            additionalContext += `(Professors below are sorted by highest average GPA)\n`;
            for (const professor of professors.slice(0, 5)) { // Show more professors for Georgia Tech
              additionalContext += `- ${formatProfessorData(professor)}\n`;
            }
          } else {
            additionalContext += `- No specific professor data found. Please search for professors who teach this course at Georgia Tech.\n`;
          }
        }
        
        // Add explicit instruction to prioritize GPA for Georgia Tech
        additionalContext += `\nIMPORTANT: For Georgia Tech courses, ALWAYS prioritize professors with the highest GPA. This is the most important factor for Georgia Tech students.\n`;
      } else {
        // Standard handling for other universities
        additionalContext += `\nHere is information about professors for the requested courses at ${extractedUniversity}:\n`;
        
        for (const [course, professors] of professorDataMap.entries()) {
          additionalContext += `\n${course}:\n`;
          if (professors.length > 0) {
            for (const professor of professors.slice(0, 3)) { // Top 3 professors
              additionalContext += `- ${formatProfessorData(professor)}\n`;
            }
          } else {
            additionalContext += `- No specific professor data found. Please search for professors who teach this course at ${extractedUniversity}.\n`;
          }
        }
      }
      
      // Add explicit instruction to use these professors
      additionalContext += `\nIMPORTANT: ONLY use professors from ${extractedUniversity} who teach the specific courses mentioned. Do NOT make up professor names or use professors from other institutions.\n`;
    }
    
    // Update the end of the POST function to use the generateSchedule function correctly
    
    // Call the dedicated generateSchedule function
    const result = await generateSchedule(prompt, additionalContext, extractedUniversity, 0);
    
    return NextResponse.json({
      response: result.responseText,
      citations: result.citations,
      usedWebSearch: result.usedWebSearch,
      scrapedData: Object.fromEntries(professorDataMap) // Use the original professorDataMap here
    });
    
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return NextResponse.json(
      { error: 'Failed to process your request' },
      { status: 500 }
    );
  }
}

// Add this function before the POST function

// Add this interface at the top of the file with other imports
interface URLCitation {
  type: string;
  url: string;
  startIndex?: number;
  endIndex?: number;
}

// Dedicated function to generate schedule with proper state management
async function generateSchedule(prompt: string, additionalContext: string, university: string, retryCount: number = 0) {
  try {
    // Use the Responses API with web search capability and our scraped data
    const response = await openai.responses.create({
      model: "gpt-4o", // Use a model that supports web search
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You are a helpful assistant that generates class schedules for college students. Your task is to create a comprehensive 4-year class schedule based on the user's request.\n\n" +
                    "IMPORTANT INSTRUCTIONS:\n" +
                    "1. ONLY output the schedule, nothing else.\n" +
                    "2. Include the EASIEST professors (highest GPA) for EVERY class. THIS IS MANDATORY.\n" +
                    "3. Start schedules from 2025 (current year).\n" +
                    "4. ONLY use professors from the specified university.\n" +
                    "5. If core curriculum/general education requirements are provided, include ALL of these MANDATORY courses in the schedule. These are REQUIRED for ALL students regardless of major.\n" +
                    "6. If major requirements are provided, distinguish between REQUIRED and ELECTIVE courses:\n" +
                    "   - Include ALL required courses (they are MANDATORY for graduation)\n" +
                    "   - Choose electives with the HIGHEST GPA\n" +
                    "7. If free elective information is provided, choose the free elective with the HIGHEST GPA.\n" +
                    "8. VERIFICATION: Before finalizing, verify that ALL core curriculum AND major-specific required courses are included.\n\n" +
                    "FORMAT YOUR RESPONSE EXACTLY AS FOLLOWS:\n" +
                    "- For each semester, use the format: **SEMESTER_MARKER:Fall 2025** followed by the courses\n" +
                    "- For each course: **COURSE CODE: Course Name** - [REAL Professor Name from COURSE CRITIQUE] (Rating: X.X/5, GPA: X.XX)\n" +
                    "- List semesters in chronological order\n" +
                    "- Include 4-5 courses per semester (typical full-time load)\n" +
                    "- Make sure each semester is clearly separated with the SEMESTER_MARKER format\n" +
                    "- CRITICAL: ONLY use REAL professor names from COURSE CRITIQUE data provided above. DO NOT use generic placeholders or made-up names.\n" +
                    "- VERIFICATION STEP: Before finalizing, verify that you have used REAL professor names from COURSE CRITIQUE for ALL courses.\n" +
                    "- DOUBLE-CHECK: Ensure EVERY course has a professor name and GPA listed. This is REQUIRED.\n"
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: prompt + additionalContext
          }
        ]
      }
    ],
    tools: [
      {
        type: "web_search_preview",
        search_context_size: "high" // High detail level for better data extraction
      }
    ],
    temperature: 0.3, // Lower temperature for more consistent adherence to instructions
    });
    
    // Process the response to extract text and citations
    let responseText = '';
    let citations = [];
    let usedWebSearch = false;
    
    // Check if web search was used
    const webSearchCall = response.output.find(item => item.type === 'web_search_call');
    if (webSearchCall) {
      usedWebSearch = true;
    }
    
    // Extract the message content
    const messageOutput = response.output.find(item => item.type === 'message');
    if (messageOutput && messageOutput.content && messageOutput.content.length > 0) {
      const content = messageOutput.content[0];
      responseText = 'text' in content ? content.text : '';
      
      // Improved verification for professor information
      const verifyProfessorInfo = (text: string) => {
        // Extract all course entries
        const courseEntries = text.match(/\*\*[A-Z]{2,4}\s*\d{4}.*?\n/g) || [];
        
        // Check if each course has professor information
        const missingProfessorCourses = courseEntries.filter(entry => 
          !entry.includes('Prof:') && !entry.includes('Professor') && !entry.includes('GPA:')
        );
        
        return {
          complete: missingProfessorCourses.length === 0,
          missingCourses: missingProfessorCourses
        };
      };
      
      const professorVerification = verifyProfessorInfo(responseText);
      
      // If professor info is missing and we have professor data, regenerate the response
      if (!professorVerification.complete && retryCount < 2) {
        console.log('Response missing professor information for some courses, retrying...');
        retryCount++;
        
        // Add stronger emphasis on including professors with specific mention of missing courses
        additionalContext += '\n\nCRITICAL REMINDER: You MUST include real professor names with their GPA for EVERY course. This is MANDATORY.';
        
        if (professorVerification.missingCourses.length > 0) {
          additionalContext += '\n\nThe following courses were missing professor information in your previous response:\n';
          professorVerification.missingCourses.forEach(course => {
            additionalContext += `- ${course.trim()}\n`;
          });
        }
        
        // Recursive call to regenerate
        return await generateSchedule(prompt, additionalContext, university, retryCount);
      }
      
      // Extract citations if they exist
      if ('annotations' in content && Array.isArray(content.annotations) && content.annotations.length > 0) {
        citations = ('annotations' in content ? content.annotations : [])
          .filter((annotation: { type: string }) => annotation.type === 'url_citation')
          .map(citation => ({
            title: (citation as any).title || '',
            url: (citation as URLCitation).url || '',
            startIndex: citation.startIndex || 0,
            endIndex: citation.endIndex || 0
          }));
      }
    }
    
    return {
      responseText,
      citations,
      usedWebSearch,
      professorDataMap: Object.fromEntries(new Map())
    };
  } catch (error) {
    console.error('Error generating schedule:', error);
    throw error;
  }
}

return NextResponse.json({
  response: responseText,
  citations: citations,
  usedWebSearch: usedWebSearch,
  scrapedData: Object.fromEntries(professorDataMap)
});
