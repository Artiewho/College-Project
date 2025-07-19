import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Make sure to add this to your environment variables
});

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();
    
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }
    
    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4", // You can change this to the model you want to use
      messages: [
        { role: "system", content: "You are a helpful assistant that provides detailed college class schedules based on user requirements." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
    });
    
    // Return the response
    return NextResponse.json({
      response: completion.choices[0].message.content,
    });
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return NextResponse.json(
      { error: 'Failed to process your request' },
      { status: 500 }
    );
  }
}