import "dotenv/config";
import { embed, streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createClient } from "@supabase/supabase-js";

async function testRoute() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  console.log("Using API Key:", !!apiKey);

  const google = createGoogleGenerativeAI({ apiKey });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  );

  const message = "Tell me about iPhone 16";
  console.log("1. Generating embedding for:", message);

  try {
    const { embedding } = await embed({
      model: google.textEmbeddingModel("gemini-embedding-001"),
      value: message,
      providerOptions: { google: { outputDimensionality: 768 } },
    });
    console.log("Embedding generated, length:", embedding.length);

    console.log("2. Calling Supabase RPC get_relevant_chunks...");
    const { data, error } = await supabase.rpc("get_relevant_chunks", {
      query_vector: embedding,
      match_threshold: 0.5,
      match_count: 10,
    });

    if (error) {
      console.error("Supabase RPC Error:", error);
      return;
    }

    console.log("Supabase RPC returned data count:", data?.length);
    console.log("First chunk preview:", data?.[0]);
  } catch (err: any) {
    console.error("Caught error:", err);
  }
}

testRoute();
