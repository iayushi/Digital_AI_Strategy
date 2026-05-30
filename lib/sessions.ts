import rawConfig from "../course.config.json";

export interface SampleQuestion {
  label: string;
  question: string;
}

export interface Session {
  week: number;
  title: string;
  sampleQuestions: SampleQuestion[];
}

interface CourseConfig {
  courseName: string;
  courseSubtitle: string;
  sessions: Session[];
}

const config = rawConfig as CourseConfig;

export const COURSE_NAME: string = config.courseName;
export const COURSE_SUBTITLE: string = config.courseSubtitle ?? "";
export const SESSIONS: Session[] = config.sessions;
export const DEFAULT_WEEK: number = config.sessions[0]?.week ?? 1;
