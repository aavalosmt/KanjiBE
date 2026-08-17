import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.story.upsert({
    where: { id: "story-123" },
    update: {},
    create: {
      id: "story-123",
      title: "本文",
      level: "N3",
      translation: "Texto Principal",
      coverUrl: "https://cdn.tuapp.com/covers/story1.jpg",
      blocks: JSON.stringify([
        {
          id: "b1",
          type: "text",
          content:
            "[最近](furigana:さいきん)、[ホテル](furigana:ほてる)で[正月](furigana:しょう.がつ)を[すごす](furigana:すごす)[人](furigana:ひと)が[ふえた](furigana:ふえた)そうである。",
          translation:
            "Dicen que últimamente ha aumentado la gente que pasa el Año Nuevo en un hotel."
        },
        {
          id: "b2",
          type: "image",
          url: "https://cdn.tuapp.com/images/hotel-shogatsu.jpg",
          caption: "Hotel en Año Nuevo"
        }
      ])
    }
  });

  await prisma.lyric.upsert({
    where: { id: "song-456" },
    update: {},
    create: {
      id: "song-456",
      title: "Brave Heart",
      artist: "Ayumi Miyazaki",
      translation: "Corazón Valiente",
      coverUrl: "https://cdn.tuapp.com/covers/song456.jpg",
      blocks: JSON.stringify([
        {
          id: "b1",
          type: "header",
          content: "Verso 1",
          translation: "Verse 1"
        },
        {
          id: "b2",
          type: "text",
          content: "[逃げ出さ](furigana:に.げ.だ.さ)ないことは [解](furigana:わか)っている",
          translation: "Sé que no voy a huir"
        }
      ])
    }
  });

  await prisma.conversation.upsert({
    where: { id: "conv-konbini" },
    update: {},
    create: {
      id: "conv-konbini",
      title: "コンビニで",
      topic: "convenience_store",
      level: "N4",
      translation: "At the convenience store",
      coverUrl: "https://cdn.tuapp.com/covers/conv-konbini.jpg",
      blocks: JSON.stringify([
        {
          id: "b1",
          type: "dialogue",
          speaker: "Clerk",
          content: "[いらっしゃいませ](furigana:いらっしゃいませ)",
          translation: "Welcome!"
        },
        {
          id: "b2",
          type: "dialogue",
          speaker: "Customer",
          content:
            "[袋](furigana:ふくろ)は[いりません](furigana:いりません)",
          translation: "I don't need a bag"
        },
        {
          id: "b3",
          type: "dialogue",
          speaker: "Clerk",
          content:
            "[かしこまりました](furigana:かしこまりました)。[以上](furigana:い.じょう)でよろしいですか？",
          translation: "Understood. Will that be all?"
        }
      ])
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
