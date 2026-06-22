import fs from "fs";
import path from "path";

const BUCKET_NAME = "gemmai-lounge-assets";
const PREFIX = "VRM/VRMA/SL/";
const OUTPUT_PATH = path.join(process.cwd(), "src", "data", "vrma_index.json");

// Ensure target directory exists
const dir = path.dirname(OUTPUT_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

interface RawGcsItem {
  name: string;
}

interface IndexEntry {
  name: string;      // clean filename (e.g., SG ASL HELLO 2024-6-16 No Mesh Mixamo.vrma)
  path: string;      // full bucket path
  url: string;       // public CDN url
  keyword: string;   // parsed keyword (hello)
  rootWord: string;  // morphological root stem
  category?: string; // semantic category if inferred
}

async function runIndexer() {
  console.log(`[VRMA-Indexer CLI] Initiating indexing sequence for bucket '${BUCKET_NAME}' and prefix '${PREFIX}'...`);
  
  let rawItems: RawGcsItem[] = [];
  let pageToken = "";
  let fetchCount = 0;

  // 1. Fetch via paginated JSON API
  try {
    do {
      fetchCount++;
      const url = `https://storage.googleapis.com/storage/v1/b/${BUCKET_NAME}/o?prefix=${encodeURIComponent(PREFIX)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
      console.log(`[VRMA-Indexer CLI] Page ${fetchCount} JSON API fetch...`);
      const res = await fetch(url);
      if (res.ok) {
        const data: any = await res.json();
        if (data.items && Array.isArray(data.items)) {
          rawItems = rawItems.concat(data.items);
        }
        pageToken = data.nextPageToken || "";
      } else {
        console.warn(`[VRMA-Indexer CLI] GCS JSON API returned error status: ${res.status}`);
        break;
      }
    } while (pageToken);
  } catch (gcsError) {
    console.warn("[VRMA-Indexer CLI] GCS JSON API threw error:", gcsError);
  }

  // 2. Fetch via XML API fallback if JSON returned empty
  if (rawItems.length === 0) {
    try {
      console.log(`[VRMA-Indexer CLI] JSON API returned empty. Querying XML GCS Bucket listing API...`);
      const xmlUrl = `https://${BUCKET_NAME}.storage.googleapis.com/?prefix=${encodeURIComponent(PREFIX)}`;
      const res = await fetch(xmlUrl);
      if (res.ok) {
        const xmlText = await res.text();
        const keyRegex = /<Key>([^<]+)<\/Key>/g;
        let match;
        while ((match = keyRegex.exec(xmlText)) !== null) {
          const fullKey = match[1];
          if (fullKey.toLowerCase().endsWith(".vrma")) {
            rawItems.push({ name: fullKey });
          }
        }
        console.log(`[VRMA-Indexer CLI] XML scraper found ${rawItems.length} matching Keys.`);
      }
    } catch (xmlError) {
      console.warn("[VRMA-Indexer CLI] XML scraper fallback failed:", xmlError);
    }
  }

  // 3. Process maps
  const animMap = new Map<string, IndexEntry>();

  console.log(`[VRMA-Indexer CLI] Total raw objects located: ${rawItems.length}`);

  for (const item of rawItems) {
    if (!item.name || !item.name.toLowerCase().endsWith(".vrma")) continue;

    const parts = item.name.split("/");
    const filename = parts[parts.length - 1];

    let keyword = "";
    // Match standard ASL naming conventions
    const dateMatch = filename.match(/SG\s+ASL\s+(.*?)\s+\d{4}-\d{1,2}-\d{1,2}/i);
    if (dateMatch) {
      keyword = dateMatch[1].toLowerCase().trim();
    } else {
      keyword = filename
        .replace(/^SG\s+ASL\s+/i, "")
        .replace(/No\s+Mesh.*$/i, "")
        .replace(/\.vrma$/i, "")
        .toLowerCase()
        .trim();
    }

    if (!keyword) continue;

    let rootWord = keyword;
    // Clear details like '(alt)' or trailing numerals indicating distinct clips
    rootWord = rootWord.replace(/\s*\(alt\)/g, "");
    const trailingNumMatch = rootWord.match(/^(.*?)\s+\d+$/);
    if (trailingNumMatch) {
      rootWord = trailingNumMatch[1].toLowerCase().trim();
    }

    const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${encodeURIComponent(item.name)}`;
    const isV2 = item.name.toLowerCase().includes("/version2/");

    const entry: IndexEntry = {
      name: filename,
      path: item.name,
      url: publicUrl,
      keyword,
      rootWord: rootWord !== keyword ? rootWord : keyword,
    };

    // Keep newer version2 or v2 references as priority
    const existing = animMap.get(keyword);
    if (!existing || (isV2 && !existing.name.toLowerCase().includes("version2"))) {
      animMap.set(keyword, entry);
    }
  }

  const outputArray = Array.from(animMap.values());
  console.log(`[VRMA-Indexer CLI] Parsing sequence finished. Unique keyword index count: ${outputArray.length}`);

  // Write static index to file
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(outputArray, null, 2), "utf8");
  console.log(`[VRMA-Indexer CLI] Successfully synthesized metadata index file. Saved to: ${OUTPUT_PATH}`);
}

runIndexer().catch((e) => {
  console.error("[VRMA-Indexer CLI] Indexer failed fatally:", e);
  process.exit(1);
});
