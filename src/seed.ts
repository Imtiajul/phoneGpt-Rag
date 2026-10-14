import "dotenv/config";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { PuppeteerWebBaseLoader } from "@langchain/community/document_loaders/web/puppeteer";
import { createClient } from "@supabase/supabase-js";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embedMany } from "ai";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase URL or Anon Key in environment variables.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!apiKey) {
  throw new Error("Missing Gemini API Key. Please set GEMINI_API_KEY in .env");
}

const google = createGoogleGenerativeAI({ apiKey });

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,
  chunkOverlap: 100,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const scrapePage = async (url: string): Promise<string> => {
  const loader = new PuppeteerWebBaseLoader(url, {
    launchOptions: {
      headless: true,
    },
    gotoOptions: {
      waitUntil: "domcontentloaded",
    },
  });
  return (await loader.scrape()).replace(/<[^>]*>?/gm, "");
};

// Embed with automatic retry and exponential backoff for 429 rate limits
async function embedBatchWithRetry(
  values: string[],
  retries = 5
): Promise<number[][]> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { embeddings } = await embedMany({
        model: google.textEmbeddingModel("gemini-embedding-2"),
        values,
        providerOptions: {
          google: {
            outputDimensionality: 768,
          },
        },
      });
      return embeddings;
    } catch (err: any) {
      const isRateLimit =
        err?.statusCode === 429 ||
        err?.message?.includes("429") ||
        err?.message?.includes("quota") ||
        err?.message?.includes("RESOURCE_EXHAUSTED");

      if (isRateLimit && attempt < retries) {
        // Retry backoff: 25s, 45s, 65s...
        const waitMs = 25000 + (attempt - 1) * 20000;
        console.warn(
          `⚠️ Rate limit reached (429). Waiting ${waitMs / 1000}s before retry (attempt ${attempt}/${retries})...`
        );
        await sleep(waitMs);
      } else {
        throw err;
      }
    }
  }
  throw new Error("Failed to embed batch after multiple retries.");
}

const BATCH_SIZE = 25;

const loadData = async (webpages: string[]) => {
  for (const url of webpages) {
    console.log(`\n========================================`);
    console.log(`Scraping: ${url}`);
    console.log(`========================================`);

    const content = await scrapePage(url);
    const chunks = await splitter.splitText(content);
    console.log(`Generated ${chunks.length} chunks for ${url}`);

    // Remove existing chunks for this URL so re-running is idempotent and avoids duplicates
    await supabase.from("chunks").delete().eq("url", url);

    // Process chunks in batches of 25 to respect Gemini free-tier RPM limits
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batchChunks = chunks.slice(i, i + BATCH_SIZE);
      const start = i + 1;
      const end = Math.min(i + BATCH_SIZE, chunks.length);

      console.log(`Embedding chunks ${start}-${end} of ${chunks.length}...`);

      const embeddings = await embedBatchWithRetry(batchChunks);

      const rows = batchChunks.map((chunk, idx) => ({
        content: chunk,
        vector: embeddings[idx],
        url: url,
      }));

      const { error } = await supabase.from("chunks").insert(rows);

      if (error) {
        console.error(`Error inserting batch ${start}-${end}:`, error);
      } else {
        console.log(`Saved batch ${start}-${end} to Supabase.`);
      }

      // Small delay between batches to stay comfortably within the 100 RPM quota
      await sleep(1500);
    }

    console.log(`Finished processing: ${url}`);
  }
};

loadData([
  "https://en.wikipedia.org/wiki/Samsung_Galaxy_S25",
  "https://en.wikipedia.org/wiki/Samsung_Galaxy_S24",
  "https://en.wikipedia.org/wiki/IPhone_16",
  "https://en.wikipedia.org/wiki/IPhone_16_Pro",
  "https://en.wikipedia.org/wiki/IPhone_15",
  "https://en.wikipedia.org/wiki/IPhone_15_Pro",
])
  .then(() => {
    console.log("\n🎉 All webpages scraped and seeded successfully!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Seeding failed:", err);
    process.exit(1);
  });