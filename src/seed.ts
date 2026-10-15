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

// Optimized chunk size to preserve semantic context while keeping
// total requests safely within the 1000 requests/day free tier quota.
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1200,
  chunkOverlap: 150,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const scrapePage = async (url: string): Promise<string> => {
  const loader = new PuppeteerWebBaseLoader(url, {
    launchOptions: {
      headless: true,
    },
    gotoOptions: {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    },
  });
  return (await loader.scrape()).replace(/<[^>]*>?/gm, "");
};

function isRateLimitError(err: any): boolean {
  const fullErrorText = (
    String(err?.message || "") +
    " " +
    String(err?.cause || "") +
    " " +
    JSON.stringify(err?.lastError || "") +
    " " +
    JSON.stringify(err?.errors || "")
  ).toLowerCase();

  return (
    err?.statusCode === 429 ||
    err?.status === 429 ||
    err?.lastError?.statusCode === 429 ||
    fullErrorText.includes("429") ||
    fullErrorText.includes("resource_exhausted") ||
    fullErrorText.includes("rate limit") ||
    fullErrorText.includes("quota")
  );
}

// Embed with automatic retry and exponential backoff
async function embedBatchWithRetry(
  values: string[],
  retries = 5
): Promise<number[][]> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { embeddings } = await embedMany({
        model: google.textEmbeddingModel("gemini-embedding-001"),
        values,
        providerOptions: {
          google: {
            outputDimensionality: 768,
          },
        },
      });
      return embeddings;
    } catch (err: any) {
      if (isRateLimitError(err) && attempt < retries) {
        // Backoff: 30s, 40s, 50s... to allow the free-tier 1-minute RPM window to reset
        const waitMs = 20000 + attempt * 10000;
        console.warn(
          `⚠️ Rate limit encountered. Pausing for ${waitMs / 1000}s to reset RPM quota (attempt ${attempt}/${retries})...`
        );
        await sleep(waitMs);
      } else {
        throw err;
      }
    }
  }
  throw new Error("Failed to embed batch after retries.");
}

const BATCH_SIZE = 10;
// 4500ms delay between batches stays comfortably under the Gemini 15 RPM free tier limit
const DELAY_BETWEEN_BATCHES_MS = 4500;

// Set --force flag via CLI (e.g. npm run seed -- --force) to force re-seeding existing URLs
const FORCE_RESEED = process.argv.includes("--force");

const loadData = async (webpages: string[]) => {
  let totalSaved = 0;
  let totalSkipped = 0;
  const now = new Date().toISOString();

  if (FORCE_RESEED) {
    console.log("⚡ --force flag detected. Existing pages will be re-scraped and updated.");
  }

  for (const url of webpages) {
    try {
      // Option 1 check: If URL already has chunks in Supabase, skip to save free-tier quota
      if (!FORCE_RESEED) {
        const { count, error } = await supabase
          .from("chunks")
          .select("*", { count: "exact", head: true })
          .eq("url", url);

        if (!error && count && count > 0) {
          console.log(
            `⏩ Skipping: ${url}\n   Already seeded (${count} chunks exist in Supabase). Use --force to re-seed.`
          );
          totalSkipped++;
          continue;
        }
      }

      console.log(`\n========================================`);
      console.log(`Scraping: ${url}`);
      console.log(`========================================`);

      const content = await scrapePage(url);
      const chunks = await splitter.splitText(content);
      console.log(`Generated ${chunks.length} chunks for ${url}`);

      // Delete existing chunks for this URL so re-running is idempotent and clean
      await supabase.from("chunks").delete().eq("url", url);

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
          date_updated: now,
        }));

        const { error } = await supabase.from("chunks").insert(rows);

        if (error) {
          console.error(`Error inserting batch ${start}-${end}:`, error);
        } else {
          console.log(`Saved batch ${start}-${end} to Supabase.`);
          totalSaved += rows.length;
        }

        // Delay between batches to stay under 15 RPM
        await sleep(DELAY_BETWEEN_BATCHES_MS);
      }

      console.log(`Finished processing: ${url}`);
    } catch (urlErr) {
      console.error(`❌ Failed processing URL ${url}:`, urlErr);
    }
  }

  console.log(`\n========================================`);
  console.log(`Seeding summary:`);
  console.log(`- New chunks saved: ${totalSaved}`);
  console.log(`- Webpages skipped (already seeded): ${totalSkipped}`);
  console.log(`========================================`);
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