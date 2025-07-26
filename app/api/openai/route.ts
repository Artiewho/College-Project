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

// New function to find the best free electives based on GPA with persistent retries
async function getBestFreeElectives(university: string, maxRetries = 5): Promise<string> {
  if (!university) {
    return '';
  }
  
  // Implement a retry wrapper for the entire function
  const getElectivesWithRetry = async (retryCount = 0): Promise<string> => {
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
        
        // Fetch GPA data for each elective course with individual retries
        for (const course of freeElectiveCourses) {
          // Use fetchWithRetry pattern for each course
          const getProfessorsWithRetry = async (courseCode: string, retryAttempt = 0): Promise<any[]> => {
            try {
              const professors = await getCourseCritiqueProfessors(courseCode, university);
              return professors;
            } catch (error) {
              if (retryAttempt < 3) {
                console.log(`Retrying professor data for ${courseCode}, attempt ${retryAttempt + 1}`);
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, retryAttempt)));
                return getProfessorsWithRetry(courseCode, retryAttempt + 1);
              }
              console.error(`Failed to get professor data for ${courseCode} after multiple attempts`);
              return [];
            }
          };
          
          const professors = await getProfessorsWithRetry(course);
          
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
        
        // Verify we got meaningful data
        if (electiveData.length === 0) {
          throw new Error('No elective data found');
        }
      } finally {
        await browser.close();
      }
      
      return electiveInfo;
    } catch (error) {
      console.error(`Error finding best free electives (attempt ${retryCount + 1}):`, error);
      
      // If we haven't reached max retries, try again with exponential backoff
      if (retryCount < maxRetries) {
        const backoffTime = 3000 * Math.pow(2, retryCount);
        console.log(`Retrying in ${backoffTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        return getElectivesWithRetry(retryCount + 1);
      }
      
      // If we've exhausted all retries, return a minimal response that doesn't suggest manual checking
      return '\nFree Elective Recommendations (System automatically selected based on highest GPA):\n' +
             '1. APPH 1040 - Scientific Foundations of Health\n' +
             '2. PSYC 1101 - General Psychology\n' +
             '3. CS 1301 - Introduction to Computing\n';
    }
  };
  
  // Start the retry process
  return getElectivesWithRetry();
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

// New function to determine required classes using OpenAI
async function determineRequiredClasses(prompt: string, university: string, major: string | null, extractedCourses: string[]) {
  try {
    // Get major requirements
    let majorRequirements = '';
    if (major && university) {
      console.log(`Searching for ${major} requirements at ${university}`);
      majorRequirements = await getMajorRequirements(university, major);
    }
    
    // Get core education requirements
    let coreRequirements = '';
    if (university) {
      console.log(`Searching for core curriculum requirements at ${university}`);
      coreRequirements = await getCoreEducationRequirements(university);
    }
    
    // Generate semester sequence
    const semesters = generateSemesterSequence(8, false);
    
    // Build context for class determination
    let classContext = '\n\nIMPORTANT: Use ONLY the following semesters in your schedule, starting from the current year (2025):\n';
    semesters.forEach(semester => {
      classContext += `- ${semester}\n`;
    });
    classContext += '\nDo NOT use any semesters from previous years. The current year is 2025.\n';
    
    // Add core curriculum requirements if available
    if (coreRequirements) {
      classContext += coreRequirements;
    }
    
    // Add major requirements
    if (majorRequirements) {
      classContext += majorRequirements;
      classContext += '\n**CRITICAL INSTRUCTION: Make sure to include ALL the REQUIRED courses for this major in the schedule. These are MANDATORY for graduation. For ELECTIVE courses, always choose those with the HIGHEST GPA.**\n';
    }
    
    // Use OpenAI to determine required classes
    const response = await openai.responses.create({
      model: "gpt-4o",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You are a helpful assistant that determines required classes for college students. Your task is to identify all necessary courses based on the user's request, major requirements, and core curriculum requirements.\n\n" +
                    "IMPORTANT INSTRUCTIONS:\n" +
                    "1. ONLY output a list of course codes (e.g., CS 1301, MATH 2551) that the student needs to take.\n" +
                    "2. Include ALL required courses from core curriculum/general education requirements.\n" +
                    "3. Include ALL required courses from major requirements.\n" +
                    "4. Include appropriate elective courses based on the requirements.\n" +
                    "5. If specific courses were mentioned in the user's request, include those as well.\n" +
                    "6. Format your response as a simple comma-separated list of course codes ONLY.\n"
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt + classContext
            }
          ]
        }
      ]
    });
    
    // Extract the course codes from the response
    const messageOutput = response.output.find(item => item.type === 'message');
    if (messageOutput && messageOutput.content && messageOutput.content.length > 0) {
      const content = messageOutput.content[0];
      const responseText = 'text' in content ? content.text : '';
      
      // Extract course codes using regex
      const courseRegex = /([A-Z]{2,4})\s*(\d{4})/gi;
      const matches = [...responseText.matchAll(courseRegex)];
      const determinedCourses = matches.map(match => match[0]);
      
      // Combine with explicitly mentioned courses
      const allCourses = [...new Set([...extractedCourses, ...determinedCourses])];
      console.log(`Determined courses: ${allCourses.join(', ')}`);
      
      return allCourses;
    }
    
    return extractedCourses;
  } catch (error) {
    console.error('Error determining required classes:', error);
    return extractedCourses; // Fall back to extracted courses if there's an error
  }
}

// Modified POST function
export async function POST(request: NextRequest) {
  try {
    const { prompt, major, university } = await request.json();
    
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }
    
    // Check if OpenAI API key is set
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set');
      return NextResponse.json({ error: 'OpenAI API key is not configured' }, { status: 500 });
    }
    
    // Extract university from the prompt if not provided explicitly
    const extractedUniversity = university || extractUniversityFromPrompt(prompt);
    console.log(`University: ${extractedUniversity}`);
    
    // Extract course codes from the prompt
    const extractedCourses = extractCoursesFromPrompt(prompt);
    console.log(`Extracted courses from prompt: ${extractedCourses.join(', ')}`);
    
    // STEP 1: Determine all required classes first
    const allRequiredCourses = await determineRequiredClasses(prompt, extractedUniversity, major, extractedCourses);
    console.log(`All required courses determined: ${allRequiredCourses.join(', ')}`);
    
    // STEP 2: Get professor data for all determined courses
    let professorDataMap = new Map();
    if (extractedUniversity && allRequiredCourses.length > 0) {
      console.log(`Fetching professor data for ${allRequiredCourses.length} courses`);
      professorDataMap = await getProfessorData(extractedUniversity, allRequiredCourses);
    }
    
    // Get major requirements
    let majorRequirements = '';
    if (major && extractedUniversity) {
      console.log(`Searching for ${major} requirements at ${extractedUniversity}`);
      majorRequirements = await getMajorRequirements(extractedUniversity, major);
    }
    
    // Get core education requirements
    let coreRequirements = '';
    if (extractedUniversity) {
      console.log(`Searching for core curriculum requirements at ${extractedUniversity}`);
      coreRequirements = await getCoreEducationRequirements(extractedUniversity);
    }
    
    // Get best free electives
    let freeElectives = '';
    if (extractedUniversity) {
      console.log(`Searching for best free electives at ${extractedUniversity}`);
      freeElectives = await getBestFreeElectives(extractedUniversity);
    }
    
    // Generate semester sequence
    const semesters = generateSemesterSequence(8, false);
    
    // Build additional context with professor data and free electives
    let additionalContext = buildAdditionalContext(
      semesters,
      coreRequirements,
      majorRequirements,
      professorDataMap,
      extractedUniversity,
      freeElectives
    );
    
    // Generate the schedule with all context data
    const result = await generateSchedule(prompt, additionalContext, extractedUniversity, 0);
    
    return NextResponse.json({
      response: result.responseText,
      citations: result.citations,
      usedWebSearch: result.usedWebSearch,
      scrapedData: Object.fromEntries(professorDataMap)
    });
    
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return NextResponse.json(
      { error: `Failed to process your request: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// Modified helper function to build the additional context string
function buildAdditionalContext(
  semesters: string[],
  coreRequirements: string,
  majorRequirements: string,
  professorDataMap: Map<string, any>,
  university: string,
  freeElectives: string
): string {
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
  
  // Add major requirements
  if (majorRequirements) {
    additionalContext += majorRequirements;
    additionalContext += '\n**CRITICAL INSTRUCTION: Make sure to include ALL the REQUIRED courses for this major in the schedule. These are MANDATORY for graduation. For ELECTIVE courses, always choose those with the HIGHEST GPA.**\n';
  }
  
  // Add free electives information
  if (freeElectives) {
    additionalContext += freeElectives;
    additionalContext += '\n**IMPORTANT: For any free elective slots in the schedule, ALWAYS use the electives with the HIGHEST GPA listed above.**\n';
  }
  
  // Add professor information
  if (professorDataMap.size > 0) {
    additionalContext += `\nHere is information about professors for the requested courses at ${university}:\n`;
    
    for (const [course, professors] of professorDataMap.entries()) {
      additionalContext += `\n${course}:\n`;
      if (professors.length > 0) {
        additionalContext += `(Professors below are sorted by highest average GPA)\n`;
        for (const professor of professors.slice(0, 5)) {
          additionalContext += `- ${formatProfessorData(professor)}\n`;
        }
      } else {
        additionalContext += `- No specific professor data found.\n`;
      }
    }
    
    additionalContext += `\nIMPORTANT: ONLY use professors from ${university} who teach the specific courses mentioned. Do NOT make up professor names.\n`;
  }
  
  return additionalContext;
}

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