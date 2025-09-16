import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://example.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4YW1wbGUiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY0MjU0MjQwMCwiZXhwIjoxOTU4MTE4NDAwfQ.example';

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn('Supabase environment variables not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      exams: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      courses: {
        Row: {
          id: string;
          exam_id: string | null;
          name: string;
          description: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          exam_id?: string | null;
          name: string;
          description?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          exam_id?: string | null;
          name?: string;
          description?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      questions: {
        Row: {
          id: string;
          question_type: 'MCQ' | 'MSQ' | 'NAT' | 'Subjective';
          question_statement: string;
          options: string[] | null;
          created_at: string | null;
          updated_at: string | null;
          course_id: string | null;
          categorized: boolean | null;
          year: number | null;
        };
        Insert: {
          id?: string;
          question_type: 'MCQ' | 'MSQ' | 'NAT' | 'Subjective';
          question_statement: string;
          options?: string[] | null;
          created_at?: string | null;
          updated_at?: string | null;
          course_id?: string | null;
          categorized?: boolean | null;
          year?: number | null;
        };
        Update: {
          id?: string;
          question_type?: 'MCQ' | 'MSQ' | 'NAT' | 'Subjective';
          question_statement?: string;
          options?: string[] | null;
          created_at?: string | null;
          updated_at?: string | null;
          course_id?: string | null;
          categorized?: boolean | null;
          year?: number | null;
        };
      };
    };
    new_questions: {
      Row: {
        id: string;
        topic_id: string | null;
        topic_name: string;
        question_statement: string;
        question_type: 'MCQ' | 'MSQ' | 'NAT' | 'Subjective';
        options: string[] | null;
        solution: string | null;
        difficulty_level: string | null;
        created_at: string | null;
        updated_at: string | null;
        slot: string | null;
        part: string | null;
        correct_marks: number | null;
        incorrect_marks: number | null;
        skipped_marks: number | null;
        partial_marks: number | null;
        time_minutes: number | null;
        answer: string | null;
        purpose: string | null;
        chapter_id: string | null;
      };
      Insert: {
        id?: string;
        topic_id?: string | null;
        topic_name: string;
        question_statement: string;
        question_type: 'MCQ' | 'MSQ' | 'NAT' | 'Subjective';
        options?: string[] | null;
        solution?: string | null;
        difficulty_level?: string | null;
        created_at?: string | null;
        updated_at?: string | null;
        slot?: string | null;
        part?: string | null;
        correct_marks?: number | null;
        incorrect_marks?: number | null;
        skipped_marks?: number | null;
        partial_marks?: number | null;
        time_minutes?: number | null;
        answer?: string | null;
        purpose?: string | null;
        chapter_id?: string | null;
      };
      Update: {
        id?: string;
        topic_id?: string | null;
        topic_name?: string;
        question_statement?: string;
        question_type?: 'MCQ' | 'MSQ' | 'NAT' | 'Subjective';
        options?: string[] | null;
        solution?: string | null;
        difficulty_level?: string | null;
        created_at?: string | null;
        updated_at?: string | null;
        slot?: string | null;
        part?: string | null;
        correct_marks?: number | null;
        incorrect_marks?: number | null;
        skipped_marks?: number | null;
        partial_marks?: number | null;
        time_minutes?: number | null;
        answer?: string | null;
        purpose?: string | null;
        chapter_id?: string | null;
      };
    };
    questions_topic_wise: {
      Row: {
        id: string;
        question_id: string | null;
        topic_id: string | null;
        is_primary: boolean | null;
        confidence_score: number | null;
        created_at: string | null;
        updated_at: string | null;
        question_statement: string | null;
        options: string[] | null;
        topic_name: string | null;
        year: number | null;
        slot: string | null;
        part: string | null;
        correct_marks: number | null;
        incorrect_marks: number | null;
        skipped_marks: number | null;
        partial_marks: number | null;
        time_minutes: number | null;
        answer: string | null;
        solution: string | null;
        question_type: string | null;
        answer_done: boolean | null;
        solution_done: boolean | null;
        chapter_id: string | null;
      };
      Insert: {
        id?: string;
        question_id?: string | null;
        topic_id?: string | null;
        is_primary?: boolean | null;
        confidence_score?: number | null;
        created_at?: string | null;
        updated_at?: string | null;
        question_statement?: string | null;
        options?: string[] | null;
        topic_name?: string | null;
        year?: number | null;
        slot?: string | null;
        part?: string | null;
        correct_marks?: number | null;
        incorrect_marks?: number | null;
        skipped_marks?: number | null;
        partial_marks?: number | null;
        time_minutes?: number | null;
        answer?: string | null;
        solution?: string | null;
        question_type?: string | null;
        answer_done?: boolean | null;
        solution_done?: boolean | null;
        chapter_id?: string | null;
      };
      Update: {
        id?: string;
        question_id?: string | null;
        topic_id?: string | null;
        is_primary?: boolean | null;
        confidence_score?: number | null;
        created_at?: string | null;
        updated_at?: string | null;
        question_statement?: string | null;
        options?: string[] | null;
        topic_name?: string | null;
        year?: number | null;
        slot?: string | null;
        part?: string | null;
        correct_marks?: number | null;
        incorrect_marks?: number | null;
        skipped_marks?: number | null;
        partial_marks?: number | null;
        time_minutes?: number | null;
        answer?: string | null;
        solution?: string | null;
        question_type?: string | null;
        answer_done?: boolean | null;
        solution_done?: boolean | null;
        chapter_id?: string | null;
      };
    };
    topics: {
      Row: {
        id: string;
        chapter_id: string | null;
        name: string;
        description: string | null;
        created_at: string | null;
        updated_at: string | null;
        notes: string | null;
        short_notes: string | null;
        slots: string | null;
        parts: string | null;
        weightage: number | null;
        is_notes_done: boolean | null;
        is_short_notes_done: boolean | null;
        is_mcq_done: boolean | null;
        is_msq_done: boolean | null;
        is_nat_done: boolean | null;
        is_sub_done: boolean | null;
      };
      Insert: {
        id?: string;
        chapter_id?: string | null;
        name: string;
        description?: string | null;
        created_at?: string | null;
        updated_at?: string | null;
        notes?: string | null;
        short_notes?: string | null;
        slots?: string | null;
        parts?: string | null;
        weightage?: number | null;
        is_notes_done?: boolean | null;
        is_short_notes_done?: boolean | null;
        is_mcq_done?: boolean | null;
        is_msq_done?: boolean | null;
        is_nat_done?: boolean | null;
        is_sub_done?: boolean | null;
      };
      Update: {
        id?: string;
        chapter_id?: string | null;
        name?: string;
        description?: string | null;
        created_at?: string | null;
        updated_at?: string | null;
        notes?: string | null;
        short_notes?: string | null;
        slots?: string | null;
        parts?: string | null;
        weightage?: number | null;
        is_notes_done?: boolean | null;
        is_short_notes_done?: boolean | null;
        is_mcq_done?: boolean | null;
        is_msq_done?: boolean | null;
        is_nat_done?: boolean | null;
        is_sub_done?: boolean | null;
      };
    };
  };
};