import React, { useState, useCallback } from 'react';
import { Brain, BookOpen, Database, Zap, Settings, Play, Pause, CheckCircle, Circle, Hash, Edit3, Target, TrendingUp, Clock, Award } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { generateQuestionsForTopic, generateSolutionsForPYQs, validateAndCorrectQuestion, ExtractedQuestion } from '../lib/gemini';
import { QuestionPreview } from './QuestionPreview';
import toast, { Toaster } from 'react-hot-toast';

interface Exam {
  id: string;
  name: string;
}

interface Course {
  id: string;
  name: string;
  exam_id: string;
}

interface Topic {
  id: string;
  name: string;
  chapter_id: string;
  weightage: number;
  notes: string;
  is_notes_done: boolean;
  is_short_notes_done: boolean;
  is_mcq_done: boolean;
  is_msq_done: boolean;
  is_nat_done: boolean;
  is_sub_done: boolean;
}

interface PYQ {
  id: string;
  topic_id: string;
  topic_name: string;
  question_statement: string;
  options: string[];
  answer: string;
  solution: string;
  question_type: string;
  year: number;
  slot: string;
  part: string;
}

interface QuestionTypeConfig {
  type: 'MCQ' | 'MSQ' | 'NAT' | 'Subjective';
  correct_marks: number;
  incorrect_marks: number;
  skipped_marks: number;
  partial_marks: number;
  time_minutes: number;
}

interface GenerationProgress {
  currentTopic: string;
  currentTopicIndex: number;
  totalTopics: number;
  currentQuestionInTopic: number;
  totalQuestionsInTopic: number;
  totalQuestionsGenerated: number;
  totalQuestionsTarget: number;
  isGenerating: boolean;
  isPaused: boolean;
  stage: 'questions' | 'solutions' | 'pyq_solutions';
}

export function QuestionGenerator() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [slots, setSlots] = useState<{id: string, slot_name: string}[]>([]);
  const [parts, setParts] = useState<{id: string, part_name: string}[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  
  const [selectedExam, setSelectedExam] = useState<string>('');
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [selectedPart, setSelectedPart] = useState<string>('');
  
  const [generationMode, setGenerationMode] = useState<'new_questions' | 'pyq_solutions'>('new_questions');
  const [questionType, setQuestionType] = useState<'MCQ' | 'MSQ' | 'NAT' | 'Subjective'>('MCQ');
  const [totalQuestions, setTotalQuestions] = useState<number>(30);
  
  const [questionConfig, setQuestionConfig] = useState<QuestionTypeConfig>({
    type: 'MCQ',
    correct_marks: 4,
    incorrect_marks: -1,
    skipped_marks: 0,
    partial_marks: 0,
    time_minutes: 3
  });
  
  const [progress, setProgress] = useState<GenerationProgress>({
    currentTopic: '',
    currentTopicIndex: 0,
    totalTopics: 0,
    currentQuestionInTopic: 0,
    totalQuestionsInTopic: 0,
    totalQuestionsGenerated: 0,
    totalQuestionsTarget: 0,
    isGenerating: false,
    isPaused: false,
    stage: 'questions'
  });
  
  const [recentQuestions, setRecentQuestions] = useState<ExtractedQuestion[]>([]);
  const [generatedCount, setGeneratedCount] = useState({ new: 0, pyq: 0 });

  React.useEffect(() => {
    loadExams();
  }, []);

  React.useEffect(() => {
    if (selectedExam) {
      loadCourses(selectedExam);
    }
  }, [selectedExam]);

  React.useEffect(() => {
    if (selectedCourse) {
      loadSlotsAndParts(selectedCourse);
      loadTopics(selectedCourse);
    }
  }, [selectedCourse]);

  React.useEffect(() => {
    setQuestionConfig(prev => ({ ...prev, type: questionType }));
  }, [questionType]);

  const loadExams = async () => {
    try {
      const { data, error } = await supabase
        .from('exams')
        .select('id, name')
        .order('name');
      
      if (error) throw error;
      setExams(data || []);
    } catch (error) {
      toast.error('Failed to load exams');
      console.error('Error loading exams:', error);
    }
  };

  const loadCourses = async (examId: string) => {
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('id, name, exam_id')
        .eq('exam_id', examId)
        .order('name');
      
      if (error) throw error;
      setCourses(data || []);
    } catch (error) {
      toast.error('Failed to load courses');
      console.error('Error loading courses:', error);
    }
  };

  const loadSlotsAndParts = async (courseId: string) => {
    try {
      // Load slots
      const { data: slotsData, error: slotsError } = await supabase
        .from('slots')
        .select('id, slot_name')
        .eq('course_id', courseId)
        .order('slot_name');
      
      if (slotsError) throw slotsError;
      setSlots(slotsData || []);

      // Load parts
      const { data: partsData, error: partsError } = await supabase
        .from('parts')
        .select('id, part_name')
        .eq('course_id', courseId)
        .order('part_name');
      
      if (partsError) throw partsError;
      setParts(partsData || []);
    } catch (error) {
      toast.error('Failed to load slots and parts');
      console.error('Error loading slots and parts:', error);
    }
  };

  const loadTopics = async (courseId: string) => {
    try {
      const { data, error } = await supabase
        .from('topics')
        .select(`
          id, name, chapter_id, weightage, notes,
          is_notes_done, is_short_notes_done, is_mcq_done, is_msq_done, is_nat_done, is_sub_done,
          chapters!inner(course_id)
        `)
        .eq('chapters.course_id', courseId)
        .order('weightage', { ascending: false });
      
      if (error) throw error;
      setTopics(data || []);
    } catch (error) {
      toast.error('Failed to load topics');
      console.error('Error loading topics:', error);
    }
  };

  const calculateTopicQuestions = (topics: Topic[], totalQuestions: number) => {
    const totalWeightage = topics.reduce((sum, topic) => sum + (topic.weightage || 0.02), 0);
    
    return topics.map(topic => {
      const effectiveWeightage = topic.weightage || 0.02;
      const questionsForTopic = Math.max(1, Math.round((effectiveWeightage / totalWeightage) * totalQuestions));
      return {
        ...topic,
        questionsToGenerate: questionsForTopic
      };
    });
  };

  const startGeneration = async () => {
    if (!selectedExam || !selectedCourse || topics.length === 0) {
      toast.error('Please select exam, course and ensure topics are loaded');
      return;
    }

    const topicsWithQuestions = calculateTopicQuestions(topics, totalQuestions);
    const totalTopicsToProcess = topicsWithQuestions.filter(t => t.questionsToGenerate > 0).length;

    setProgress({
      currentTopic: '',
      currentTopicIndex: 0,
      totalTopics: totalTopicsToProcess,
      currentQuestionInTopic: 0,
      totalQuestionsInTopic: 0,
      totalQuestionsGenerated: 0,
      totalQuestionsTarget: totalQuestions,
      isGenerating: true,
      isPaused: false,
      stage: generationMode === 'new_questions' ? 'questions' : 'pyq_solutions'
    });

    try {
      if (generationMode === 'new_questions') {
        await generateNewQuestions(topicsWithQuestions);
      } else {
        await generatePYQSolutions();
      }
    } catch (error) {
      console.error('Generation error:', error);
      toast.error(`Generation failed: ${error.message}`);
    } finally {
      setProgress(prev => ({ ...prev, isGenerating: false, isPaused: false }));
    }
  };

  const generateNewQuestions = async (topicsWithQuestions: any[]) => {
    const examName = exams.find(e => e.id === selectedExam)?.name || '';
    const courseName = courses.find(c => c.id === selectedCourse)?.name || '';
    
    let totalGenerated = 0;
    const allGeneratedQuestions: ExtractedQuestion[] = [];

    for (let topicIndex = 0; topicIndex < topicsWithQuestions.length; topicIndex++) {
      const topic = topicsWithQuestions[topicIndex];
      
      if (topic.questionsToGenerate === 0) continue;

      setProgress(prev => ({
        ...prev,
        currentTopic: topic.name,
        currentTopicIndex: topicIndex + 1,
        currentQuestionInTopic: 0,
        totalQuestionsInTopic: topic.questionsToGenerate
      }));

      // Get PYQs for this topic
      const { data: pyqs, error: pyqError } = await supabase
        .from('questions_topic_wise')
        .select('*')
        .eq('topic_id', topic.id);

      if (pyqError) {
        console.error('Error loading PYQs:', pyqError);
      }

      // Get already generated questions for this topic
      const { data: allExistingQuestions, error: existingError } = await supabase
        .from('new_questions')
        .select('question_statement, options, answer')
        .eq('topic_id', topic.id)
        .eq('question_type', questionType)
        .order('created_at', { ascending: false });

      if (existingError) {
        console.error('Error loading existing questions:', existingError);
      }

      // Format existing questions for AI context
      const existingQuestionsContext = (allExistingQuestions || []).map((q, index) => 
        `${index + 1}. ${q.question_statement}${q.options ? `\nOptions: ${q.options.join(', ')}` : ''}${q.answer ? `\nAnswer: ${q.answer}` : ''}`
      ).join('\n\n');

      // Generate questions for this topic
      for (let questionIndex = 0; questionIndex < topic.questionsToGenerate; questionIndex++) {
        if (progress.isPaused) {
          await new Promise(resolve => {
            const checkPause = () => {
              if (!progress.isPaused) {
                resolve(undefined);
              } else {
                setTimeout(checkPause, 1000);
              }
            };
            checkPause();
          });
        }

        setProgress(prev => ({
          ...prev,
          currentQuestionInTopic: questionIndex + 1
        }));

        // Try to generate a valid question (with retry logic)
        let validQuestionGenerated = false;
        let attempts = 0;
        const maxAttempts = 5; // Maximum attempts to generate a valid question
        
        while (!validQuestionGenerated && attempts < maxAttempts) {
          attempts++;
          
          try {
            toast(`🧠 Generating question ${questionIndex + 1}/${topic.questionsToGenerate} for ${topic.name} (attempt ${attempts})...`, { duration: 2000 });

            const generatedQuestions = await generateQuestionsForTopic(
              topic,
              examName,
              courseName,
              questionType,
              pyqs || [],
              existingQuestionsContext,
              allGeneratedQuestions.filter(q => q.topic_id === topic.id).map(q => q.question_statement),
              1 // Generate one question at a time
            );

            if (generatedQuestions.length > 0) {
              const question = generatedQuestions[0];
              
              // Enhanced validation with correction
              toast(`🔍 Validating question ${questionIndex + 1} for ${topic.name}...`, { duration: 1500 });
              const validation = await validateAndCorrectQuestion(question);
              
              if (!validation.isValid) {
                toast.error(`❌ Question validation failed: ${validation.reason}. Regenerating...`);
                console.log('Invalid question:', {
                  question: question.question_statement,
                  options: question.options,
                  answer: question.answer,
                  reason: validation.reason
                });
                
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 3000));
                continue;
              }
              
              // Use corrected question if available
              const finalQuestion = validation.correctedQuestion || question;
              
              // Log if question was corrected
              if (validation.correctedQuestion && validation.correctedQuestion !== question) {
                toast.success(`🔧 Question ${questionIndex + 1} corrected and validated!`);
                console.log('Question corrected:', {
                  original: question.options,
                  corrected: validation.correctedQuestion.options,
                  answer: validation.correctedQuestion.answer
                });
              }
              
              // Save the validated/corrected question to database
              const questionToSave = {
                topic_id: topic.id,
                topic_name: topic.name,
                chapter_id: topic.chapter_id,
                question_statement: finalQuestion.question_statement,
                question_type: questionType,
                options: finalQuestion.options,
                answer: finalQuestion.answer,
                solution: finalQuestion.solution,
                slot: selectedSlot || null,
                part: selectedPart || null,
                correct_marks: questionConfig.correct_marks,
                incorrect_marks: questionConfig.incorrect_marks,
                skipped_marks: questionConfig.skipped_marks,
                partial_marks: questionConfig.partial_marks,
                time_minutes: questionConfig.time_minutes,
                difficulty_level: 'Medium',
                purpose: 'practice'
              };

              const { data, error } = await supabase
                .from('new_questions')
                .insert([questionToSave])
                .select();

              if (error) {
                console.error('Error saving question:', error);
                toast.error(`Failed to save question: ${error.message}`);
              } else {
                totalGenerated++;
                allGeneratedQuestions.push(finalQuestion);
                validQuestionGenerated = true;
                
                // Add this question to existing questions context for next iterations
                if (allExistingQuestions) {
                  allExistingQuestions.unshift({
                    question_statement: finalQuestion.question_statement,
                    options: finalQuestion.options,
                    answer: finalQuestion.answer
                  });
                }
                
                // Keep only last 3 questions for preview
                setRecentQuestions(prev => {
                  const updated = [...prev, finalQuestion];
                  return updated.slice(-3);
                });

                setProgress(prev => ({
                  ...prev,
                  totalQuestionsGenerated: totalGenerated
                }));

                toast.success(`✅ Question ${questionIndex + 1} validated and saved!`);
              }
            }

            // Delay between attempts/questions
            await new Promise(resolve => setTimeout(resolve, 8000));

          } catch (error) {
            console.error(`Error generating question ${questionIndex + 1} for topic ${topic.name} (attempt ${attempts}):`, error);
            toast.error(`Failed to generate question ${questionIndex + 1} (attempt ${attempts}): ${error.message}`);
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
        
        // If we couldn't generate a valid question after max attempts
        if (!validQuestionGenerated) {
          toast.error(`⚠️ Could not generate valid question ${questionIndex + 1} for ${topic.name} after ${maxAttempts} attempts. Skipping...`);
          console.warn(`Skipped question ${questionIndex + 1} for topic ${topic.name} after ${maxAttempts} failed attempts`);
        }
      }

      // Delay between topics
      if (topicIndex < topicsWithQuestions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    setGeneratedCount(prev => ({ ...prev, new: prev.new + totalGenerated }));
    toast.success(`🎉 Generation complete! Generated ${totalGenerated} questions across ${topicsWithQuestions.length} topics!`);
  };

  const generatePYQSolutions = async () => {
    // Get PYQs without solutions
    const { data: pyqsWithoutSolutions, error } = await supabase
      .from('questions_topic_wise')
      .select(`
        *, 
        topics!inner(id, name, notes, chapter_id)
      `)
      .or('solution.is.null,solution.eq.')
      .eq('topics.chapters.course_id', selectedCourse);

    if (error) {
      console.error('Error loading PYQs:', error);
      toast.error('Failed to load PYQs');
      return;
    }

    if (!pyqsWithoutSolutions || pyqsWithoutSolutions.length === 0) {
      toast.success('All PYQs already have solutions!');
      return;
    }

    setProgress(prev => ({
      ...prev,
      totalQuestionsTarget: pyqsWithoutSolutions.length,
      stage: 'pyq_solutions'
    }));

    let solutionsGenerated = 0;

    for (let i = 0; i < pyqsWithoutSolutions.length; i++) {
      const pyq = pyqsWithoutSolutions[i];

      if (progress.isPaused) {
        await new Promise(resolve => {
          const checkPause = () => {
            if (!progress.isPaused) {
              resolve(undefined);
            } else {
              setTimeout(checkPause, 1000);
            }
          };
          checkPause();
        });
      }

      setProgress(prev => ({
        ...prev,
        currentTopic: pyq.topics.name,
        totalQuestionsGenerated: i + 1
      }));

      try {
        toast(`🧠 Generating solution for PYQ ${i + 1}/${pyqsWithoutSolutions.length}...`, { duration: 2000 });

        const solutions = await generateSolutionsForPYQs([pyq], pyq.topics.notes);

        if (solutions.length > 0) {
          const solution = solutions[0];
          
          // Update the PYQ with answer and solution
          const { error: updateError } = await supabase
            .from('questions_topic_wise')
            .update({
              answer: solution.answer,
              solution: solution.solution,
              answer_done: true,
              solution_done: true
            })
            .eq('id', pyq.id);

          if (updateError) {
            console.error('Error updating PYQ:', updateError);
            toast.error(`Failed to save solution: ${updateError.message}`);
          } else {
            solutionsGenerated++;
            toast.success(`✅ Solution ${i + 1} generated and saved!`);
          }
        }

        // Delay between solutions
        await new Promise(resolve => setTimeout(resolve, 8000));

      } catch (error) {
        console.error(`Error generating solution for PYQ ${i + 1}:`, error);
        toast.error(`Failed to generate solution ${i + 1}: ${error.message}`);
      }
    }

    setGeneratedCount(prev => ({ ...prev, pyq: prev.pyq + solutionsGenerated }));
    toast.success(`🎉 PYQ Solutions complete! Generated ${solutionsGenerated} solutions!`);
  };

  const pauseGeneration = () => {
    setProgress(prev => ({ ...prev, isPaused: !prev.isPaused }));
    toast(progress.isPaused ? '▶️ Generation resumed' : '⏸️ Generation paused');
  };

  const stopGeneration = () => {
    setProgress(prev => ({ ...prev, isGenerating: false, isPaused: false }));
    toast('🛑 Generation stopped');
  };

  const getQuestionTypeIcon = (type: string) => {
    switch (type) {
      case 'MCQ': return <Circle className="w-4 h-4 text-blue-500" />;
      case 'MSQ': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'NAT': return <Hash className="w-4 h-4 text-orange-500" />;
      case 'Subjective': return <Edit3 className="w-4 h-4 text-purple-500" />;
      default: return <Circle className="w-4 h-4 text-gray-500" />;
    }
  };

  const topicsWithQuestions = calculateTopicQuestions(topics, totalQuestions);
  const canStartGeneration = selectedExam && selectedCourse && topics.length > 0 && !progress.isGenerating;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50">
      <Toaster position="top-right" />
      
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 rounded-2xl shadow-lg">
              <Brain className="w-12 h-12 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent mb-4">
            AI Question Generator
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Generate high-quality practice questions and solutions using AI, based on previous year questions and topic weightage
          </p>
          
          {/* Features */}
          <div className="flex items-center justify-center gap-8 mt-8 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-500" />
              <span>AI-Powered</span>
            </div>
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-500" />
              <span>Weightage-Based</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              <span>PYQ Analysis</span>
            </div>
          </div>
        </div>

        {/* Configuration Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {/* Exam Selection */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <BookOpen className="w-4 h-4" />
                Select Exam
              </label>
              <select
                value={selectedExam}
                onChange={(e) => setSelectedExam(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              >
                <option value="">Choose an exam...</option>
                {exams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Course Selection */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <Database className="w-4 h-4" />
                Select Course
              </label>
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                disabled={!selectedExam}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:bg-gray-50"
              >
                <option value="">Choose a course...</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Generation Mode */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <Settings className="w-4 h-4" />
                Generation Mode
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    value="new_questions"
                    checked={generationMode === 'new_questions'}
                    onChange={(e) => setGenerationMode(e.target.value as any)}
                    className="w-4 h-4 text-purple-600 border-gray-300 focus:ring-purple-500"
                  />
                  <span className="text-sm">Generate New Questions</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    value="pyq_solutions"
                    checked={generationMode === 'pyq_solutions'}
                    onChange={(e) => setGenerationMode(e.target.value as any)}
                    className="w-4 h-4 text-purple-600 border-gray-300 focus:ring-purple-500"
                  />
                  <span className="text-sm">Generate PYQ Solutions</span>
                </label>
              </div>
            </div>
          </div>

          {/* Slot and Part Configuration */}
          {selectedCourse && (
            <div className="border-t border-gray-200 pt-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-6">Paper Configuration (Optional)</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                    <Clock className="w-4 h-4" />
                    Slot
                  </label>
                  <select
                    value={selectedSlot}
                    onChange={(e) => setSelectedSlot(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  >
                    <option value="">Select a slot (optional)</option>
                    {slots.map((slot) => (
                      <option key={slot.id} value={slot.slot_name}>
                        {slot.slot_name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                    <BookOpen className="w-4 h-4" />
                    Part
                  </label>
                  <select
                    value={selectedPart}
                    onChange={(e) => setSelectedPart(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  >
                    <option value="">Select a part (optional)</option>
                    {parts.map((part) => (
                      <option key={part.id} value={part.part_name}>
                        {part.part_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Question Configuration for New Questions */}
              {generationMode === 'new_questions' && (
                <div>
                  <h4 className="text-md font-semibold text-gray-800 mb-4">Question Configuration</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                    {/* Question Type */}
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                        {getQuestionTypeIcon(questionType)}
                        Question Type
                      </label>
                      <select
                        value={questionType}
                        onChange={(e) => setQuestionType(e.target.value as any)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                      >
                        <option value="MCQ">MCQ (Single Correct)</option>
                        <option value="MSQ">MSQ (Multiple Correct)</option>
                        <option value="NAT">NAT (Numerical Answer)</option>
                        <option value="Subjective">Subjective (Descriptive)</option>
                      </select>
                    </div>

                    {/* Total Questions */}
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                        <Hash className="w-4 h-4" />
                        Number of Questions
                      </label>
                      <input
                        type="number"
                        value={totalQuestions}
                        onChange={(e) => setTotalQuestions(parseInt(e.target.value) || 30)}
                        min="1"
                        max="2000"
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                      />
                    </div>

                    {/* Time per Question */}
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                        <Clock className="w-4 h-4" />
                        Time (minutes)
                      </label>
                      <input
                        type="number"
                        value={questionConfig.time_minutes}
                        onChange={(e) => setQuestionConfig(prev => ({ ...prev, time_minutes: parseFloat(e.target.value) || 3 }))}
                        min="0.5"
                        max="60"
                        step="0.5"
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>

                  {/* Marking Scheme */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-2 block">Correct Marks</label>
                      <input
                        type="number"
                        value={questionConfig.correct_marks}
                        onChange={(e) => setQuestionConfig(prev => ({ ...prev, correct_marks: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-2 block">Incorrect Marks</label>
                      <input
                        type="number"
                        value={questionConfig.incorrect_marks}
                        onChange={(e) => setQuestionConfig(prev => ({ ...prev, incorrect_marks: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-2 block">Skipped Marks</label>
                      <input
                        type="number"
                        value={questionConfig.skipped_marks}
                        onChange={(e) => setQuestionConfig(prev => ({ ...prev, skipped_marks: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-2 block">Partial Marks</label>
                      <input
                        type="number"
                        value={questionConfig.partial_marks}
                        onChange={(e) => setQuestionConfig(prev => ({ ...prev, partial_marks: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Topic Weightage Preview */}
        {generationMode === 'new_questions' && topics.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
            <h3 className="text-xl font-bold text-gray-800 mb-6">Topic Distribution Preview</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topicsWithQuestions.slice(0, 12).map((topic, index) => (
                <div key={topic.id} className="bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-lg border border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-gray-800 truncate">{topic.name}</h4>
                    <div className="flex items-center gap-1 text-xs text-purple-600">
                      <TrendingUp className="w-3 h-3" />
                      {((topic.weightage || 0.02) * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Questions:</span>
                    <span className="font-semibold text-purple-700">{topic.questionsToGenerate}</span>
                  </div>
                </div>
              ))}
            </div>
            {topicsWithQuestions.length > 12 && (
              <p className="text-sm text-gray-500 mt-4 text-center">
                And {topicsWithQuestions.length - 12} more topics...
              </p>
            )}
          </div>
        )}

        {/* Generation Controls */}
        <div className="flex gap-4 justify-center mb-8">
          {!progress.isGenerating ? (
            <button
              onClick={startGeneration}
              disabled={!canStartGeneration}
              className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              <Play className="w-5 h-5" />
              {generationMode === 'new_questions' ? `🚀 Generate ${totalQuestions} Questions` : '🚀 Generate PYQ Solutions'}
            </button>
          ) : (
            <div className="flex gap-4">
              <button
                onClick={pauseGeneration}
                className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
              >
                {progress.isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                {progress.isPaused ? 'Resume' : 'Pause'}
              </button>
              
              <button
                onClick={stopGeneration}
                className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
              >
                Stop Generation
              </button>
            </div>
          )}
        </div>

        {/* Progress Indicator */}
        {progress.isGenerating && (
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-8">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-medium text-blue-900">
                  🤖 {progress.stage === 'questions' ? 'Generating Questions' : 'Generating Solutions'}
                  {progress.isPaused && ' (Paused)'}
                </h3>
                <span className="text-sm font-medium text-blue-700">
                  {progress.totalQuestionsGenerated}/{progress.totalQuestionsTarget}
                </span>
              </div>
              <p className="text-sm text-blue-600 mb-3">
                📚 Current Topic: {progress.currentTopic}
              </p>
            </div>
            
            <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
              <div
                className="bg-gradient-to-r from-purple-600 to-indigo-600 h-3 rounded-full transition-all duration-300"
                style={{
                  width: `${(progress.totalQuestionsGenerated / progress.totalQuestionsTarget) * 100}%`
                }}
              />
            </div>
            
            {progress.totalTopics > 0 && (
              <p className="text-sm text-blue-600">
                🎯 Topic {progress.currentTopicIndex}/{progress.totalTopics} | 
                Question {progress.currentQuestionInTopic}/{progress.totalQuestionsInTopic} in current topic
              </p>
            )}
          </div>
        )}

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-2xl p-6 border border-blue-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-blue-500 p-2 rounded-lg">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-blue-800">New Questions Generated</h3>
            </div>
            <p className="text-3xl font-bold text-blue-900">{generatedCount.new}</p>
            <p className="text-sm text-blue-600 mt-1">Ready for practice</p>
          </div>
          
          <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-2xl p-6 border border-green-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-green-500 p-2 rounded-lg">
                <Award className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-green-800">PYQ Solutions Generated</h3>
            </div>
            <p className="text-3xl font-bold text-green-900">{generatedCount.pyq}</p>
            <p className="text-sm text-green-600 mt-1">Solutions completed</p>
          </div>
        </div>

        {/* Recent Questions Preview */}
        {recentQuestions.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-800">
                🎉 Recently Generated Questions (Last 3)
              </h2>
            </div>
            
            <div className="space-y-6">
              {recentQuestions.map((question, index) => (
                <QuestionPreview
                  key={index}
                  question={question}
                  index={recentQuestions.length - index}
                  showControls={false}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}