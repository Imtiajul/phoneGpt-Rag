import { convertToModelMessages, embed, streamText, UIMessage } from "ai";
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
  const { messages } = (await req.json()) as { messages: UIMessage[] };

  // Safely extract the latest user query text from UIMessage
  const latestMsg = messages.at(-1);
  const latestMessageText =
    typeof (latestMsg as any)?.content === "string"
      ? (latestMsg as any).content
      : latestMsg?.parts
          ?.filter((p) => p.type === "text")
          .map((p) => (p as any).text)
          .join("") || "";

  // Convert UI messages from useChat to model messages
  const modelMessages = await convertToModelMessages(messages);

  let context = "";
  if (latestMessageText.trim()) {
    try {
      // Generate embedding using the same model & dimensions as the seed script
      const { embedding } = await embed({
        model: google.textEmbeddingModel("gemini-embedding-001"),
        value: latestMessageText,
        providerOptions: { google: { outputDimensionality: 768 } },
      });

      // Fetch relevant chunks from Supabase
      const { data, error } = await supabase.rpc("get_relevant_chunks", {
        query_vector: embedding,
        match_threshold: 0.5,
        match_count: 10,
      });

      if (error) {
        console.warn(
          "⚠️ Supabase RPC get_relevant_chunks notice (run src/setupdb.sql in Supabase to enable vector matching):",
          error.message
        );
      } else if (data && data.length > 0) {
        context = data
          .map(
            (d: any) =>
              `Source: ${d.url}\nUpdated: ${d.date_updated ?? "Recently"}\n${d.content}`
          )
          .join("\n---\n");
      }
    } catch (embErr) {
      console.warn("⚠️ Failed fetching context from embeddings:", embErr);
    }
  }

  // Stream response with Gemini 3.8 Flash
  const result = streamText({
    model: google("gemini-3.8-flash"),
    system: context
      ? `${SYSTEM_PROMPT}\n\nCONTEXT:\n${context}`
      : `${SYSTEM_PROMPT}\n\nNote: Direct database context was not retrieved. Answer from your own knowledge.`,
    messages: modelMessages,
  });

  // Returns the UI message stream response expected by useChat()
  return result.toUIMessageStreamResponse();
}