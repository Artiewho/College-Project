require('dotenv').config({ path: '.env.local' });
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function testOpenAI() {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello, are you working?" }],
    });
    console.log('OpenAI API is working!');
    console.log(response.choices[0].message.content);
  } catch (error) {
    console.error('OpenAI API Error:', error.message);
  }
}

testOpenAI();