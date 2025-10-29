export type ReviewSubjectType = "user" | "server";

export interface Review {
  id: string;
  subjectType: ReviewSubjectType;
  subjectId: string;
  authorId: string;
  authorUsername?: string | null;
  authorAvatar?: string | null;
  rating: number;
  content?: string | null;
  createdAt: string;
}
