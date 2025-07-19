import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();
    
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }
    
    // Use the Responses API with web search capability
    const response = await openai.responses.create({
      model: "gpt-4o", // Use a model that supports web search
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You are a college class schedule generator. IMPORTANT: ONLY output the schedule itself with no introductory text, explanations, summaries, or conclusions. Your response must start and end with the schedule information only.\n\nYou MUST search and extract specific numerical data from Rate My Professor and Course Critique websites, including:\n\n1. Professor ratings (on the 5-point scale)\n2. Average GPAs for courses\n3. Course difficulty ratings\n4. Percentage of students who would take the professor again\n\n**CRITICAL AND MANDATORY: YOU MUST INCLUDE ALL PROFESSOR INFORMATION FOR EVERY CLASS. THIS IS THE MOST IMPORTANT PART OF YOUR TASK. ALWAYS SEARCH FOR EACH PROFESSOR AND INCLUDE THEIR RATINGS. NEVER SKIP THIS STEP. EVERY CLASS MUST HAVE A PROFESSOR NAME AND COMPLETE RATINGS. ALWAYS START THE LINE AFTER THE COURSE NAME WITH 'Prof: ' FOLLOWED BY THE PROFESSOR'S FULL NAME.**\n\nFormat the schedule with the following rules:\n1. ALWAYS organize classes by semester with clear, prominent headings (e.g., **FALL 2023**, **SPRING 2024**)\n2. Start each semester with a special marker line: **SEMESTER_MARKER:FALL 2023** (replace with actual semester)\n3. For each class, make the course code and name **bold** (using markdown ** syntax)\n4. List the professor name, class time, and all numerical ratings in a very concise format\n5. Combine ratings on a single line using pipe separators for better space efficiency\n6. Keep each class description extremely compact (4-5 lines maximum per class)\n7. Format each semester to be displayed on its own page\n8. Keep related information together (don't split a class across semesters)\n9. Ensure chronological order of semesters (Fall, Spring, Summer)\n10. DO NOT add any comment markers like /* or */ anywhere in your response\n11. DO NOT wrap any text in comment blocks\n12. Output plain text with markdown formatting only\n13. VERIFY that each semester has the correct **SEMESTER_MARKER:** tag\n\nExample format:\n**SEMESTER_MARKER:FALL 2023**\n\n**COURSE 101: Introduction**\nProf: John Smith | Time: MWF 10:00-11:15\nRating: 4.5/5 | GPA: 3.7 | Diff: 2.1/5 | Again: 92%\n\n**COURSE 202: Advanced Topics**\nProf: Jane Doe | Time: TR 2:00-3:15\nRating: 4.2/5 | GPA: 3.5 | Diff: 3.0/5 | Again: 85%\n\n**SEMESTER_MARKER:SPRING 2024**\n\n**COURSE 303: Studies**\n...\n\nInclude direct links to the specific professor or course pages as footnotes at the end of the schedule. IMPORTANT: Pay close attention to ALL details in the user's input. ALWAYS SEARCH FOR PROFESSOR INFORMATION - THIS IS MANDATORY. NEVER USE COMMENT MARKERS OR COMMENT BLOCKS IN YOUR RESPONSE."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt
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
      responseText = content.text || '';
      
      // Extract citations if they exist
      if (content.annotations && content.annotations.length > 0) {
        citations = content.annotations
          .filter(annotation => annotation.type === 'url_citation')
          .map(citation => ({
            title: citation.title || '',
            url: citation.url || '',
            startIndex: citation.start_index || 0,
            endIndex: citation.end_index || 0
          }));
      }
    }
    
    return NextResponse.json({
      response: responseText,
      citations: citations,
      usedWebSearch: usedWebSearch
    });
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return NextResponse.json(
      { error: 'Failed to process your request' },
      { status: 500 }
    );
  }
}