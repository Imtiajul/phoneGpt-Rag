import { embed, streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createClient } from "@supabase/supabase-js";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

const SYSTEM_PROMPT = `You are a helpful assistant that provides information about the latest smartphones.
Use the following context to answer questions.
Return the answer in markdown format including relevant links and the date when the information was last updated.
Where the context does not provide enough information, answer from your own knowledge but caveat it so the user knows it may not be up to date.
If the user asks a question unrelated to smartphones, politely inform them that you can only answer questions about smartphones.`;

export async function POST(req: Request) {
  const { messages } = await req.json();
  const latestMessage = messages.at(-1).content;

  // Generate embedding using the same model & dimensions as the seed script
  const { embedding } = await embed({
    model: google.textEmbeddingModel("gemini-embedding-001"),
    value: latestMessage,
    providerOptions: { google: { outputDimensionality: 768 } },
  });

  // Fetch relevant chunks from Supabase
  const { data, error } = await supabase.rpc("get_relevant_chunks", {
    query_vector: embedding,
    match_threshold: 0.5,
    match_count: 10,
  });
  if (error) throw error;

  const context = data
    .map((d: any) => `Source: ${d.url}\nUpdated: ${d.date_updated}\n${d.content}`)
    .join("\n---\n");

  // Stream response with Gemini
  const result = streamText({
    model: google("gemini-2.0-flash"),
    system: `${SYSTEM_PROMPT}\n\nCONTEXT:\n${context}`,
    messages,
  });

  return result.toTextStreamResponse();
}