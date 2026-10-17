/**
 * Creates the specialty names the symptom checker can suggest, so the "Find a <specialty> doctor"
 * hand-off has real Specialization rows to match. Safe to run repeatedly (upsert by unique name).
 * The names come from ai-service/data/disease_map.json - the same file the AI service uses - so the
 * two can never drift apart.
 *
 * Usage (from the backend folder):  npm run seed:specializations
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const MAP_PATH = fileURLToPath(new URL("../../ai-service/data/disease_map.json", import.meta.url));

export function collectSpecialties(diseaseMap) {
  const names = new Set(Object.values(diseaseMap.labels).map((l) => l.specialty));
  if (diseaseMap.default_specialty) names.add(diseaseMap.default_specialty);
  return [...names].sort();
}

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const diseaseMap = JSON.parse(readFileSync(MAP_PATH, "utf8"));
    for (const name of collectSpecialties(diseaseMap)) {
      await prisma.specialization.upsert({ where: { name }, update: {}, create: { name } });
      console.log(`ok: ${name}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`seed failed: ${err?.name}`);
    process.exit(1);
  });
}
