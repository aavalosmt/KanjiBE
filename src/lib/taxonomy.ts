import { prisma } from "../db.js";

export async function unknownTopicMessage(slug: string): Promise<string | null> {
  const topic = await prisma.topic.findUnique({ where: { slug } });
  return topic ? null : `Unknown topic "${slug}". Create it first via POST /api/admin/topics.`;
}

export async function unknownSubtopicMessage(topicSlug: string, slug: string): Promise<string | null> {
  const subtopic = await prisma.subtopic.findUnique({
    where: { topicSlug_slug: { topicSlug, slug } }
  });
  return subtopic
    ? null
    : `Unknown subtopic "${slug}" under topic "${topicSlug}". Create it first via POST /api/admin/subtopics.`;
}
