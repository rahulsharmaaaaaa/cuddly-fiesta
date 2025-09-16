import React, { useState, useCallback } from 'react';
import { CheckCircle, AlertTriangle, RefreshCw, Database, Zap, Settings, Play, Pause, X, Eye, Edit } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { validateAndFixQuestion, ExtractedQuestion } from '../lib/gemini';
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

interface QuestionToCheck {
  id: string;
  topic_id: string;
  topic_name: string;
  question_statement: string;
  question_type: 'MCQ' | 'MSQ' | 'NAT' | 'Subjective';
  options: string[] | null;
  answer: string | null;
  solution: string | null;
  created_at: string;
}

interface ValidationResult {
  id: string;
  isValid: boolean;
  issues: string[];
  correctedQuestion?: ExtractedQuestion;
  status: 'pending' | 'checking' | 'valid' | 'fixed' | 'failed';
}

interface CheckProgress {
  currentQuestion: number;
  totalQuestions: number;
  currentQuestionText: string;
  validQuestions: number;
  fixedQuestions: number;
  failedQuestions: number;
  isChecking: boolean;
  isPaused: boolean;
}

export function OptionsChecker() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedExam, setSelectedExam] = useState<string>('');
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [questionType, setQuestionType] = useState<'all' | 'MCQ' | 'MSQ' | 'NAT' | 'Subjective'>('all');
  
  const [questionsToCheck, setQuestionsToCheck] = useState<QuestionToCheck[]>([]);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());
  
  const [progress, setProgress] = useState<CheckProgress>({
    currentQuestion: 0,
    totalQuestions: 0,
    currentQuestionText: '',
    validQuestions: 0,
    fixedQuestions: 0,
    failedQuestions: 0,
    isChecking: false,
    isPaused: false
  });

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
      loadQuestionsToCheck();
    }
  }, [selectedCourse, questionType]);

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

  const loadQuestionsToCheck = async () => {
    try {
      let query = supabase
        .from('new_questions')
        .select(`
          id, topic_id, topic_name, question_statement, question_type, 
          options, answer, solution, created_at,
          topics!inner(chapters!inner(course_id))
        `)
        .eq('topics.chapters.course_id', selectedCourse)
        .order('created_at', { ascending: false });

      if (questionType !== 'all') {
        query = query.eq('question_type', questionType);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      
      const questions = (data || []).map(q => ({
        id: q.id,
        topic_id: q.topic_id,
        topic_name: q.topic_name,
        question_statement: q.question_statement,
        question_type: q.question_type,
        options: q.options,
        answer: q.answer,
        solution: q.solution,
        created_at: q.created_at
      }));
      
      setQuestionsToCheck(questions);
      setValidationResults([]);
      setSelectedQuestions(new Set());
      
      toast.success(`Loaded ${questions.length} questions to check`);
    } catch (error) {
      toast.error('Failed to load questions');
      console.error('Error loading questions:', error);
    }
  };

  const toggleQuestionSelection = (questionId: string) => {
    setSelectedQuestions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(questionId)) {
        newSet.delete(questionId);
      } else {
        newSet.add(questionId);
      }
      return newSet;
    });
  };

  const selectAllQuestions = () => {
    setSelectedQuestions(new Set(questionsToCheck.map(q => q.id)));
  };

  const deselectAllQuestions = () => {
    setSelectedQuestions(new Set());
  };

  const startValidation = async () => {
    const questionsToValidate = questionsToCheck.filter(q => selectedQuestions.has(q.id));
    
    if (questionsToValidate.length === 0) {
      toast.error('Please select questions to validate');
      return;
    }

    setProgress({
      currentQuestion: 0,
      totalQuestions: questionsToValidate.length,
      currentQuestionText: '',
      validQuestions: 0,
      fixedQuestions: 0,
      failedQuestions: 0,
      isChecking: true,
      isPaused: false
    });

    // Initialize validation results
    const initialResults: ValidationResult[] = questionsToValidate.map(q => ({
      id: q.id,
      isValid: false,
      issues: [],
      status: 'pending'
    }));
    setValidationResults(initialResults);

    try {
      await validateQuestionsInBulk(questionsToValidate);
    } catch (error) {
      console.error('Validation error:', error);
      toast.error(`Validation failed: ${error.message}`);
    } finally {
      setProgress(prev => ({ ...prev, isChecking: false, isPaused: false }));
    }
  };

  const validateQuestionsInBulk = async (questions: QuestionToCheck[]) => {
    let validCount = 0;
    let fixedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];

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
        currentQuestion: i + 1,
        currentQuestionText: question.question_statement.substring(0, 100) + '...'
      }));

      // Update status to checking
      setValidationResults(prev => prev.map(result => 
        result.id === question.id 
          ? { ...result, status: 'checking' }
          : result
      ));

      try {
        toast(`🔍 Checking question ${i + 1}/${questions.length}...`, { duration: 2000 });

        const validation = await validateAndFixQuestion({
          question_statement: question.question_statement,
          question_type: question.question_type,
          options: question.options,
          answer: question.answer,
          solution: question.solution,
          page_number: 1
        });

        if (validation.isValid && !validation.correctedQuestion) {
          // Question is already valid
          validCount++;
          setValidationResults(prev => prev.map(result => 
            result.id === question.id 
              ? { ...result, isValid: true, issues: [], status: 'valid' }
              : result
          ));
          toast.success(`✅ Question ${i + 1} is valid`);
        } else if (validation.correctedQuestion) {
          // Question was fixed
          await updateQuestionInDatabase(question.id, validation.correctedQuestion);
          fixedCount++;
          setValidationResults(prev => prev.map(result => 
            result.id === question.id 
              ? { 
                  ...result, 
                  isValid: true, 
                  issues: [validation.reason || 'Fixed automatically'], 
                  correctedQuestion: validation.correctedQuestion,
                  status: 'fixed' 
                }
              : result
          ));
          toast.success(`🔧 Question ${i + 1} fixed and updated`);
        } else {
          // Question failed validation and couldn't be fixed
          failedCount++;
          setValidationResults(prev => prev.map(result => 
            result.id === question.id 
              ? { 
                  ...result, 
                  isValid: false, 
                  issues: [validation.reason || 'Validation failed'], 
                  status: 'failed' 
                }
              : result
          ));
          toast.error(`❌ Question ${i + 1} failed validation`);
        }

        setProgress(prev => ({
          ...prev,
          validQuestions: validCount,
          fixedQuestions: fixedCount,
          failedQuestions: failedCount
        }));

        // Delay between questions to avoid rate limits
        if (i < questions.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 8000));
        }

      } catch (error) {
        console.error(`Error validating question ${i + 1}:`, error);
        failedCount++;
        setValidationResults(prev => prev.map(result => 
          result.id === question.id 
            ? { 
                ...result, 
                isValid: false, 
                issues: [`Error: ${error.message}`], 
                status: 'failed' 
              }
            : result
        ));
        toast.error(`❌ Question ${i + 1} validation error: ${error.message}`);
      }
    }

    toast.success(`🎉 Validation complete! Valid: ${validCount}, Fixed: ${fixedCount}, Failed: ${failedCount}`);
  };

  const updateQuestionInDatabase = async (questionId: string, correctedQuestion: ExtractedQuestion) => {
    const { error } = await supabase
      .from('new_questions')
      .update({
        question_statement: correctedQuestion.question_statement,
        options: correctedQuestion.options,
        answer: correctedQuestion.answer,
        solution: correctedQuestion.solution,
        updated_at: new Date().toISOString()
      })
      .eq('id', questionId);

    if (error) {
      throw new Error(`Failed to update question: ${error.message}`);
    }
  };

  const pauseValidation = () => {
    setProgress(prev => ({ ...prev, isPaused: !prev.isPaused }));
    toast(progress.isPaused ? '▶️ Validation resumed' : '⏸️ Validation paused');
  };

  const stopValidation = () => {
    setProgress(prev => ({ ...prev, isChecking: false, isPaused: false }));
    toast('🛑 Validation stopped');
  };

  const getStatusColor = (status: ValidationResult['status']) => {
    switch (status) {
      case 'pending': return 'bg-gray-100 text-gray-600';
      case 'checking': return 'bg-blue-100 text-blue-600';
      case 'valid': return 'bg-green-100 text-green-600';
      case 'fixed': return 'bg-yellow-100 text-yellow-600';
      case 'failed': return 'bg-red-100 text-red-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getStatusIcon = (status: ValidationResult['status']) => {
    switch (status) {
      case 'pending': return <Settings className="w-4 h-4" />;
      case 'checking': return <RefreshCw className="w-4 h-4 animate-spin" />;
      case 'valid': return <CheckCircle className="w-4 h-4" />;
      case 'fixed': return <Zap className="w-4 h-4" />;
      case 'failed': return <AlertTriangle className="w-4 h-4" />;
      default: return <Settings className="w-4 h-4" />;
    }
  };

  const canStartValidation = selectedExam && selectedCourse && selectedQuestions.size > 0 && !progress.isChecking;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50">
      <Toaster position="top-right" />
      
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 rounded-2xl shadow-lg">
              <CheckCircle className="w-12 h-12 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent mb-4">
            Options Checker
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Validate and fix questions in bulk. Check if answers match options, verify solutions, and automatically correct issues.
          </p>
          
          {/* Features */}
          <div className="flex items-center justify-center gap-8 mt-8 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-purple-500" />
              <span>Answer Validation</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-indigo-500" />
              <span>Auto-Fix Issues</span>
            </div>
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-green-500" />
              <span>Bulk Processing</span>
            </div>
          </div>
        </div>

        {/* Configuration Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Exam Selection */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <Database className="w-4 h-4" />
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

            {/* Question Type Filter */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <Settings className="w-4 h-4" />
                Question Type
              </label>
              <select
                value={questionType}
                onChange={(e) => setQuestionType(e.target.value as any)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              >
                <option value="all">All Types</option>
                <option value="MCQ">MCQ (Single Correct)</option>
                <option value="MSQ">MSQ (Multiple Correct)</option>
                <option value="NAT">NAT (Numerical Answer)</option>
                <option value="Subjective">Subjective (Descriptive)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Questions List */}
        {questionsToCheck.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-800">
                Questions to Check ({questionsToCheck.length})
              </h2>
              
              <div className="flex items-center gap-4">
                <button
                  onClick={selectAllQuestions}
                  className="px-4 py-2 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={deselectAllQuestions}
                  className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                >
                  Deselect All
                </button>
                <span className="text-sm text-gray-600">
                  {selectedQuestions.size} selected
                </span>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-3">
              {questionsToCheck.map((question) => {
                const result = validationResults.find(r => r.id === question.id);
                
                return (
                  <div
                    key={question.id}
                    className={`border rounded-lg p-4 transition-all ${
                      selectedQuestions.has(question.id) 
                        ? 'border-purple-200 bg-purple-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <input
                        type="checkbox"
                        checked={selectedQuestions.has(question.id)}
                        onChange={() => toggleQuestionSelection(question.id)}
                        className="mt-1 w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                      />
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            question.question_type === 'MCQ' ? 'bg-blue-100 text-blue-800' :
                            question.question_type === 'MSQ' ? 'bg-green-100 text-green-800' :
                            question.question_type === 'NAT' ? 'bg-orange-100 text-orange-800' :
                            'bg-purple-100 text-purple-800'
                          }`}>
                            {question.question_type}
                          </span>
                          
                          <span className="text-xs text-gray-500">
                            {question.topic_name}
                          </span>
                          
                          {result && (
                            <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(result.status)}`}>
                              {getStatusIcon(result.status)}
                              {result.status}
                            </span>
                          )}
                        </div>
                        
                        <p className="text-sm text-gray-700 mb-2 line-clamp-2">
                          {question.question_statement.substring(0, 200)}...
                        </p>
                        
                        {question.options && (
                          <div className="text-xs text-gray-500 mb-2">
                            Options: {question.options.length} | Answer: {question.answer || 'None'}
                          </div>
                        )}
                        
                        {result && result.issues.length > 0 && (
                          <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                            Issues: {result.issues.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Validation Controls */}
        <div className="flex gap-4 justify-center mb-8">
          {!progress.isChecking ? (
            <button
              onClick={startValidation}
              disabled={!canStartValidation}
              className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              <Play className="w-5 h-5" />
              🚀 Validate {selectedQuestions.size} Questions
            </button>
          ) : (
            <div className="flex gap-4">
              <button
                onClick={pauseValidation}
                className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
              >
                {progress.isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                {progress.isPaused ? 'Resume' : 'Pause'}
              </button>
              
              <button
                onClick={stopValidation}
                className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
              >
                Stop Validation
              </button>
            </div>
          )}
        </div>

        {/* Progress Indicator */}
        {progress.isChecking && (
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-8">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-medium text-blue-900">
                  🤖 Validating Questions {progress.isPaused && '(Paused)'}
                </h3>
                <span className="text-sm font-medium text-blue-700">
                  {progress.currentQuestion}/{progress.totalQuestions}
                </span>
              </div>
              <p className="text-sm text-blue-600 mb-3">
                📝 Current: {progress.currentQuestionText}
              </p>
            </div>
            
            <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
              <div
                className="bg-gradient-to-r from-purple-600 to-indigo-600 h-3 rounded-full transition-all duration-300"
                style={{
                  width: `${(progress.currentQuestion / progress.totalQuestions) * 100}%`
                }}
              />
            </div>
            
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-green-50 p-3 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{progress.validQuestions}</div>
                <div className="text-sm text-green-600">Valid</div>
              </div>
              <div className="bg-yellow-50 p-3 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">{progress.fixedQuestions}</div>
                <div className="text-sm text-yellow-600">Fixed</div>
              </div>
              <div className="bg-red-50 p-3 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{progress.failedQuestions}</div>
                <div className="text-sm text-red-600">Failed</div>
              </div>
            </div>
          </div>
        )}

        {/* Results Summary */}
        {validationResults.length > 0 && !progress.isChecking && (
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">
              🎉 Validation Results
            </h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-green-50 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-green-600">
                  {validationResults.filter(r => r.status === 'valid').length}
                </div>
                <div className="text-sm text-green-600">Already Valid</div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {validationResults.filter(r => r.status === 'fixed').length}
                </div>
                <div className="text-sm text-yellow-600">Fixed & Updated</div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-red-600">
                  {validationResults.filter(r => r.status === 'failed').length}
                </div>
                <div className="text-sm text-red-600">Failed</div>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {validationResults.length}
                </div>
                <div className="text-sm text-blue-600">Total Checked</div>
              </div>
            </div>
            
            <button
              onClick={loadQuestionsToCheck}
              className="flex items-center gap-2 px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Questions List
            </button>
          </div>
        )}
      </div>
    </div>
  );
}