/**
 * Build script: compile a Hindi word frequency list into a compressed
 * dictionary binary file.
 *
 * Usage: npx tsx scripts/build-dictionary.ts [input.txt] [output.bin]
 *
 * Input format (tab-separated):
 *   word\tfrequency
 *   e.g.:
 *   है\t100000
 *   का\t95000
 *   में\t90000
 *
 * If no input file is provided, generates a small seed dictionary
 * with common Hindi words for development/testing.
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Dictionary } from "../src/engine/dictionary";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const inputPath = args[0];
const outputPath = args[1] || resolve(__dirname, "../data/hindi/dictionary.bin");

function generateSeedDictionary(): string {
  // Common Hindi words with approximate frequency scores
  const words: [string, number][] = [
    // High-frequency function words
    ["है", 100000],
    ["का", 95000],
    ["के", 94000],
    ["में", 93000],
    ["की", 92000],
    ["को", 91000],
    ["से", 90000],
    ["पर", 89000],
    ["ने", 88000],
    ["और", 87000],
    ["एक", 86000],
    ["यह", 85000],
    ["वह", 84000],
    ["इस", 83000],
    ["कि", 82000],
    ["नहीं", 81000],
    ["भी", 80000],
    ["हैं", 79000],
    ["तो", 78000],
    ["या", 77000],
    ["जो", 76000],
    ["हो", 75000],
    ["था", 74000],
    ["थी", 73000],
    ["थे", 72000],
    ["कर", 71000],
    ["जा", 70000],
    ["ले", 69000],
    ["दे", 68000],
    ["आ", 67000],
    // Common nouns
    ["लोग", 60000],
    ["बात", 59000],
    ["काम", 58000],
    ["दिन", 57000],
    ["समय", 56000],
    ["देश", 55000],
    ["सरकार", 54000],
    ["घर", 53000],
    ["पानी", 52000],
    ["नाम", 51000],
    ["साल", 50000],
    ["बच्चे", 49000],
    ["जगह", 48000],
    ["दुनिया", 47000],
    ["स्कूल", 46000],
    // Common verbs
    ["करना", 45000],
    ["होना", 44000],
    ["जाना", 43000],
    ["आना", 42000],
    ["देना", 41000],
    ["लेना", 40000],
    ["करता", 39000],
    ["रहा", 38000],
    ["कहा", 37000],
    ["बोला", 36000],
    ["मिला", 35000],
    ["चला", 34000],
    ["रहना", 33000],
    ["सकता", 32000],
    ["लगा", 31000],
    // Common adjectives
    ["बड़ा", 30000],
    ["छोटा", 29000],
    ["नया", 28000],
    ["पुराना", 27000],
    ["अच्छा", 26000],
    ["बहुत", 25000],
    ["सब", 24000],
    ["कुछ", 23000],
    ["पहले", 22000],
    ["बाद", 21000],
    // Greetings & common phrases
    ["नमस्ते", 20000],
    ["धन्यवाद", 19000],
    ["शुक्रिया", 18000],
    ["अभी", 17000],
    ["यहाँ", 16000],
    ["वहाँ", 15000],
    ["कैसे", 14000],
    ["क्या", 13000],
    ["कौन", 12000],
    ["कहाँ", 11000],
    ["कब", 10000],
    ["क्यों", 9000],
    // Numbers
    ["एक", 8000],
    ["दो", 7900],
    ["तीन", 7800],
    ["चार", 7700],
    ["पाँच", 7600],
    ["छह", 7500],
    ["सात", 7400],
    ["आठ", 7300],
    ["नौ", 7200],
    ["दस", 7100],
    ["सौ", 7000],
    ["हज़ार", 6900],
    ["लाख", 6800],
    ["करोड़", 6700],
    // Technology & modern words
    ["फोन", 6000],
    ["कंप्यूटर", 5900],
    ["इंटरनेट", 5800],
    ["वेबसाइट", 5700],
    ["मैसेज", 5600],
    ["वीडियो", 5500],
    // Relations
    ["माँ", 5000],
    ["पिता", 4900],
    ["भाई", 4800],
    ["बहन", 4700],
    ["दोस्त", 4600],
    ["बेटा", 4500],
    ["बेटी", 4400],
    // Places
    ["भारत", 4000],
    ["दिल्ली", 3900],
    ["मुंबई", 3800],
    // Food
    ["खाना", 3500],
    ["चाय", 3400],
    ["रोटी", 3300],
    ["दाल", 3200],
    ["चावल", 3100],
    ["दूध", 3000],
    ["पानी", 2900],
    ["मिठाई", 2800],
  ];

  return words.map(([word, freq]) => `${word}\t${freq}`).join("\n");
}

function main(): void {
  let wordListText: string;

  if (inputPath) {
    console.log(`Reading word list from: ${inputPath}`);
    wordListText = readFileSync(resolve(inputPath), "utf-8");
  } else {
    console.log("No input file specified. Generating seed dictionary...");
    wordListText = generateSeedDictionary();
  }

  const dict = new Dictionary();
  dict.loadFromWordList(wordListText);

  console.log(`Loaded ${dict.size()} words`);

  // Serialize to binary
  const binary = dict.serialize();
  const outputFile = resolve(outputPath);
  writeFileSync(outputFile, Buffer.from(binary));

  const sizeKB = (binary.byteLength / 1024).toFixed(1);
  console.log(`Written to: ${outputFile} (${sizeKB} KB)`);
}

main();
