import "dotenv/config";
import { embed, streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const google = createGoogleGenerativeAI({ apiKey });

async function testStream() {
  const result = streamText({
    model: google("gemini-2.0-flash"),
    system: "You are a helpful smartphone assistant.",
    prompt: "Tell me about iPhone 16",
  });

  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
  console.log("\nDone!");
}

testStream();
