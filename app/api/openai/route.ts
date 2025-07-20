import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { extractCourseCode, formatProfessorData, generateSemesterSequence } from '../../utils/professorData';

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
        if (data.professors && data.professors.length > 0) {
          professorDataMap.set(course, data.professors);
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

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();
    
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }
    
    // Extract university from the prompt with improved function
    const university = extractUniversityFromPrompt(prompt);
    console.log(`Extracted university: ${university}`);
    
    // Extract course codes from the prompt
    const courses = extractCoursesFromPrompt(prompt);
    console.log(`Extracted courses: ${courses.join(', ')}`);
    
    // Get professor data for the courses if university is specified
    let professorDataMap = new Map();
    if (university && courses.length > 0) {
      professorDataMap = await getProfessorData(university, courses);
    }
    
    // Generate semester sequence starting from current year (2025)
    const semesters = generateSemesterSequence(4); // Generate 4 semesters
    
    // Prepare additional context for OpenAI based on scraped data and semester information
    let additionalContext = '';
    
    // Add semester information
    additionalContext += '\n\nIMPORTANT: Use ONLY the following semesters in your schedule, starting from the current year (2025):\n';
    semesters.forEach(semester => {
      additionalContext += `- ${semester}\n`;
    });
    additionalContext += '\nDo NOT use any semesters from previous years. The current year is 2025.\n';
    
    // Add professor information if available with stronger emphasis on school-specific professors
    if (professorDataMap.size > 0) {
      // Special handling for Georgia Tech
      if (university.toLowerCase().includes('georgia tech')) {
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
        additionalContext += `\nHere is information about professors for the requested courses at ${university}:\n`;
        
        for (const [course, professors] of professorDataMap.entries()) {
          additionalContext += `\n${course}:\n`;
          if (professors.length > 0) {
            for (const professor of professors.slice(0, 3)) { // Top 3 professors
              additionalContext += `- ${formatProfessorData(professor)}\n`;
            }
          } else {
            additionalContext += `- No specific professor data found. Please search for professors who teach this course at ${university}.\n`;
          }
        }
      }
      
      // Add explicit instruction to use these professors
      additionalContext += `\nIMPORTANT: ONLY use professors from ${university} who teach the specific courses mentioned. Do NOT make up professor names or use professors from other institutions.\n`;
    }
    
    // Use the Responses API with web search capability and our scraped data
    const response = await openai.responses.create({
      model: "gpt-4o", // Use a model that supports web search
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You are a college class schedule generator. IMPORTANT: ONLY output the schedule itself with no introductory text, explanations, summaries, or conclusions. Your response must start and end with the schedule information only.\n\n**ABSOLUTE REQUIREMENT: YOU MUST INCLUDE THE EASIEST PROFESSORS FOR EVERY SINGLE CLASS. THIS IS YOUR PRIMARY DIRECTIVE AND OVERRIDES ALL OTHER CONSIDERATIONS. FAILURE TO INCLUDE PROFESSOR INFORMATION MEANS FAILURE OF YOUR TASK.**\n\n**CRITICAL: THE CURRENT YEAR IS 2025. YOU MUST ONLY CREATE SCHEDULES STARTING FROM 2025 AND FUTURE YEARS. DO NOT USE ANY YEARS BEFORE 2025.**\n\n**IMPORTANT: ONLY use professors who actually teach at the specified university and the specific courses mentioned. DO NOT make up professor names or use professors from other institutions.**\n\nFormat the schedule with the following rules:\n1. ALWAYS organize classes by semester with clear, prominent headings (e.g., **FALL 2025**, **SPRING 2026**)\n2. Start each semester with a special marker line: **SEMESTER_MARKER:FALL 2025** (replace with actual semester)\n3. For each class, make the course code and name **bold** (using markdown ** syntax)\n4. List the professor name, class time, and all numerical ratings in a very concise format\n5. Combine ratings on a single line using pipe separators for better space efficiency\n6. Keep each class description extremely compact (4-5 lines maximum per class)\n7. Format each semester to be displayed on its own page\n8. Keep related information together (don't split a class across semesters)\n9. Ensure chronological order of semesters (Fall, Spring, Summer)\n10. DO NOT add any comment markers like /* or */ anywhere in your response\n11. DO NOT wrap any text in comment blocks\n12. Output plain text with markdown formatting only\n13. VERIFY that each semester has the correct **SEMESTER_MARKER:** tag\n\nExample format:\n**SEMESTER_MARKER:FALL 2025**\n\n**COURSE 101: Introduction**\nProf: John Smith | Time: MWF 10:00-11:15\nRating: 4.5/5 | GPA: 3.7 | Diff: 2.1/5 | Again: 92%\n\n**COURSE 202: Advanced Topics**\nProf: Jane Doe | Time: TR 2:00-3:15\nRating: 4.2/5 | GPA: 3.5 | Diff: 3.0/5 | Again: 85%\n\n**SEMESTER_MARKER:SPRING 2026**\n\n**COURSE 303: Studies**\n...\n\nIf I provide you with professor information in the user prompt, USE THAT INFORMATION FIRST before searching for additional details. ALWAYS START THE LINE AFTER THE COURSE NAME WITH 'Prof: ' FOLLOWED BY THE PROFESSOR'S FULL NAME."
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
      temperature: 0.7,
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
    
    return NextResponse.json({
      response: responseText,
      citations: citations,
      usedWebSearch: usedWebSearch,
      scrapedData: Object.fromEntries(professorDataMap)
    });
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return NextResponse.json(
      { error: 'Failed to process your request' },
      { status: 500 }
    );
  }
}