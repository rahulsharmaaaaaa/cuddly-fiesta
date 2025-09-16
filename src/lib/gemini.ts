import { GoogleGenerativeAI } from '@google/generative-ai';

// Multiple API keys for rotation to avoid rate limits
const API_KEYS = [
  import.meta.env.VITE_GEMINI_API_KEY,
  'AIzaSyAp5APT1c_GHyB99qlqOEnv81LuV5aC0ZA',
  'AIzaSyBGs6lGKZbq9WhuqYH2O9rh6QHWARQMPOQ',
  'AIzaSyDJKTbMMDcyhKsh_tUQn-1b8JlppWVLy9Y',
  'AIzaSyADzQpjE3NTp2N40iSHeDAVMVp9viNZ-UY',
  'AIzaSyBFdKBHOAjdX7-DLrR4-TUlYQBWMZsxCtw',
  'AIzaSyByPzoD-YRoB1QgyKRubUtY_Ssd3AiSbKg',
  'AIzaSyAJvqiF-X1oNLZjOKcreb7di1-BIO9aZAM',
  'AIzaSyA5I_nuPEuWoppGcmGY9Y0_Eq2YGO_ATe8'
].filter(key => key && key.trim() !== '');

if (API_KEYS.length === 0) {
  throw new Error('No valid Gemini API keys found. Please set VITE_GEMINI_API_KEY or provide valid API keys.');
}

let currentKeyIndex = 0;
const keyUsageCount = new Map<string, number>();

function getNextApiKey(): string {
  // Find the key with least usage
  let bestKey = API_KEYS[0];
  let minUsage = keyUsageCount.get(bestKey) || 0;
  
  for (const key of API_KEYS) {
    const usage = keyUsageCount.get(key) || 0;
    if (usage < minUsage) {
      minUsage = usage;
      bestKey = key;
    }
  }
  
  // Increment usage count
  keyUsageCount.set(bestKey, (keyUsageCount.get(bestKey) || 0) + 1);
  
  return bestKey;
}

export interface ExtractedQuestion {
  question_number?: string;
  question_type: 'MCQ' | 'MSQ' | 'NAT' | 'Subjective';
  question_statement: string;
  options?: string[];
  is_continuation?: boolean;
  page_number: number;
  confidence_score?: number;
  spans_multiple_pages?: boolean;
  continuation_from_page?: number;
  has_image?: boolean;
  image_description?: string;
  uploaded_image?: string; // base64 image data
}

export async function analyzePageForQuestions(
  imageBase64: string,
  pageNumber: number,
  previousContext?: string
): Promise<ExtractedQuestion[]> {
  try {
    const apiKey = getNextApiKey();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
You are an expert at extracting questions from exam papers. Analyze this page image and extract ALL questions with perfect accuracy.

CRITICAL REQUIREMENTS:
1. Extract questions EXACTLY as they appear - no modifications, no paraphrasing, but if any obvious error fix that.
2. Preserve all mathematical expressions, formulas, and symbols
3. Convert mathematical content to LaTeX format when possible (use $ for inline math, $$ for display math)
4. Identify question types: MCQ (single correct), MSQ (multiple correct), NAT (numerical answer), Subjective (descriptive)
5. Extract all options exactly as written for MCQ/MSQ questions
6. Handle multi-page questions - if a question seems incomplete, mark it as continuation
7. Preserve all diagrams, figures, and images by describing them in detail they are probably in description
8. Maintain original formatting, spacing, and structure
9. Say if a description if for next few questions then write that description before each of these questions if for 3 questions then write that description with all
10. Write question statement and options saperately not together
11. If a question have three parts then consider them as three parts and instead of next question number write like 11(A), 11(B), 11(C) and so on.
${previousContext ? `PREVIOUS PAGE CONTEXT: ${previousContext}` : ''}

For each question found, provide:
- question_number (if visible)
- question_type (MCQ/MSQ/NAT/Subjective)
- question_statement (exact text with LaTeX for math)
- options (for MCQ/MSQ, exact text with LaTeX)
- is_continuation (true if this continues from previous page)

If this page contains only instructions, headers, or non-question content, return empty array.

Return response as JSON array of questions. Example:
[
  {
    "question_number": "1",
    "question_type": "MCQ",
    "question_statement": "What is the value of $\\int_0^1 x^2 dx$?",
    "options": ["$\\frac{1}{3}$", "$\\frac{1}{2}$", "$1$", "$\\frac{2}{3}$"],
    "is_continuation": false,
    "page_number": ${pageNumber}
  }
]
`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: 'image/png',
          data: imageBase64
        }
      }
    ]);

    const response = await result.response;
    const text = response.text();
    
    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log(`No questions found on page ${pageNumber}`);
      return [];
    }

    const questions = JSON.parse(jsonMatch[0]) as ExtractedQuestion[];
    return questions.map(q => ({ ...q, page_number: pageNumber }));

  } catch (error) {
    console.error(`Error analyzing page ${pageNumber}:`, error);
    throw new Error(`Failed to analyze page ${pageNumber}: ${error}`);
  }
}

export async function convertPdfToImages(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    // Use PDF.js for better PDF handling
    import('pdfjs-dist').then(async (pdfjsLib) => {
      try {
        // Set worker source
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.js',
          import.meta.url
        ).toString();
        
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const images: string[] = [];

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 4.0 }); // Ultra high resolution for better OCR
          
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          await page.render({
            canvasContext: ctx,
            viewport: viewport
          }).promise;
          
          // Convert to base64
          const imageData = canvas.toDataURL('image/png');
          const base64 = imageData.split(',')[1];
          images.push(base64);
        }
        
        resolve(images);
      } catch (error) {
        reject(error);
      }
    }).catch(reject);
  });
}

export async function enhancedQuestionExtraction(
  images: string[],
  startPageNumber: number = 1
): Promise<ExtractedQuestion[]> {
  const allQuestions: ExtractedQuestion[] = [];
  let sharedDescriptions: Map<number, string> = new Map();
  let multiPageQuestions: Map<string, ExtractedQuestion> = new Map();
  
  // First pass: Analyze all pages to identify shared descriptions and multi-page questions
  for (let i = 0; i < images.length; i++) {
    const pageNum = startPageNumber + i;
    
    try {
      const pageAnalysis = await analyzePageStructure(images[i], pageNum, i > 0 ? images[i-1] : undefined, i < images.length - 1 ? images[i+1] : undefined);
      
      // Store shared descriptions
      if (pageAnalysis.sharedDescription) {
        sharedDescriptions.set(pageNum, pageAnalysis.sharedDescription);
      }
      
      // Add delay between API calls to avoid rate limits
      if (i < images.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay with key rotation
      }
      
    } catch (error) {
      console.error(`Error in first pass analysis for page ${pageNum}:`, error);
      // Continue with next page if one fails
    }
  }
  
  // Second pass: Extract questions with full context
  for (let i = 0; i < images.length; i++) {
    const pageNum = startPageNumber + i;
    
    try {
      const questions = await extractQuestionsWithContext(
        images[i], 
        pageNum, 
        sharedDescriptions,
        i > 0 ? images[i-1] : undefined,
        i < images.length - 1 ? images[i+1] : undefined,
        allQuestions
      );
      
      allQuestions.push(...questions);
      
      // 10 second delay for round-robin API key rotation
      if (i < images.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
      
    } catch (error) {
      console.error(`Error extracting questions from page ${pageNum}:`, error);
      // Try with next API key
      continue;
    }
  }
  
  return allQuestions;
}

async function analyzePageStructure(
  imageBase64: string,
  pageNumber: number,
  previousImage?: string,
  nextImage?: string
): Promise<{
  sharedDescription?: string;
  hasMultiPageQuestion?: boolean;
  questionNumbers?: string[];
}> {
  const maxRetries = API_KEYS.length;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      const apiKey = getNextApiKey();
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: {
          temperature: 0.1,
          topK: 1,
          topP: 0.8,
        }
      });

      const prompt = `
Analyze this exam page to identify structural elements. Focus on:

1. SHARED DESCRIPTIONS: Look for text like "Description for the following X questions:" or "For questions X-Y:" or "Consider the following for next questions:"
2. MULTI-PAGE QUESTIONS: Identify if any question starts but doesn't complete on this page
3. QUESTION NUMBERS: List all question numbers visible on this page

Return JSON with this structure:
{
  "sharedDescription": "Full text of any shared description found",
  "hasMultiPageQuestion": true/false,
  "questionNumbers": ["17", "18", "19"]
}

If no shared description exists, set sharedDescription to null.
`;

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: 'image/png',
            data: imageBase64
          }
        }
      ]);

      const response = await result.response;
      const text = response.text();
      
      const jsonContent = extractJsonFromText(text);
      if (!jsonContent) {
        return {};
      }

      return JSON.parse(jsonContent);

    } catch (error: any) {
      retryCount++;
      if (error.message?.includes('429') || error.message?.includes('quota')) {
        console.log(`API key ${retryCount} hit rate limit, trying next key...`);
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      }
      throw error;
    }
  }
  
  throw new Error('All API keys exhausted for page structure analysis');
}

async function extractQuestionsWithContext(
  imageBase64: string,
  pageNumber: number,
  sharedDescriptions: Map<number, string>,
  previousImage?: string,
  nextImage?: string,
  previousQuestions: ExtractedQuestion[] = []
): Promise<ExtractedQuestion[]> {
  const maxRetries = API_KEYS.length;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      const apiKey = getNextApiKey();
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: {
          temperature: 0.1,
          topK: 1,
          topP: 0.8,
        }
      });

      // Get shared description for this page
      const currentSharedDescription = sharedDescriptions.get(pageNumber);
      
      // Build context from previous questions
      const recentContext = previousQuestions.slice(-3).map(q => 
        `Q${q.question_number}: ${q.question_statement.substring(0, 200)}...`
      ).join('\n');

      const enhancedPrompt = `
You are an EXPERT question extraction system. Extract ALL questions with ABSOLUTE PRECISION.

CRITICAL EXTRACTION RULES:
1. Extract questions EXACTLY as they appear - preserve every word, symbol, formatting
2. Convert math to LaTeX: $...$ for inline, $$...$$ for display math
3. Handle SHARED DESCRIPTIONS: If there's a description for multiple questions, include it with EACH question
4. Handle MULTI-PAGE QUESTIONS: If a question spans pages, extract the complete question
5. Handle DIAGRAMS/TABLES: Describe them in detail and include in question statement
6. NEVER skip questions with diagrams - describe the diagram thoroughly
7. For incomplete questions, mark as continuation and provide what's visible

SHARED DESCRIPTION HANDLING:
${currentSharedDescription ? `SHARED DESCRIPTION FOR THIS PAGE: "${currentSharedDescription}"` : 'No shared description found'}
- If questions share a description, include the FULL description with EACH question
- Example: If "Description for questions 17-18: [text]" exists, include this description in both Q17 and Q18

DIAGRAM/TABLE HANDLING:
- Describe ALL visual elements: charts, graphs, tables, Venn diagrams, figures
- Include table data in structured format
- For Venn diagrams: describe circles, intersections, labels, shaded regions
- For charts: describe data, axes, percentages, values
- NEVER skip questions because they have diagrams

MULTI-PAGE QUESTION HANDLING:
- If question starts but doesn't end on this page, extract what's visible
- Mark as spans_multiple_pages: true
- If question continues from previous page, mark as is_continuation: true

CONTEXT FROM PREVIOUS QUESTIONS:
${recentContext}

RESPONSE FORMAT - ENSURE PROPER JSON ESCAPING:
[
  {
    "question_number": "17",
    "question_type": "MCQ",
    "question_statement": "FULL shared description + question statement + diagram description",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "shared_description": "Full shared description text",
    "has_diagram": true,
    "diagram_description": "Detailed description of diagram/table",
    "table_content": "Structured table data if present",
    "spans_multiple_pages": false,
    "is_continuation": false,
    "page_number": ${pageNumber}
  }
]

CRITICAL: Use double backslashes (\\\\) for ALL LaTeX commands in JSON.
CRITICAL: Include shared descriptions with EVERY question that uses them.
CRITICAL: NEVER skip questions with diagrams - describe them thoroughly.
`;

      const result = await model.generateContent([
        enhancedPrompt,
        {
          inlineData: {
            mimeType: 'image/png',
            data: imageBase64
          }
        }
      ]);

      const response = await result.response;
      const text = response.text();
      
      // Robust JSON extraction
      const jsonContent = extractJsonFromText(text);
      if (!jsonContent) {
        console.log(`No valid JSON found on page ${pageNumber}`);
        return [];
      }

      try {
        const questions = JSON.parse(jsonContent) as ExtractedQuestion[];
        return questions.map(q => ({ 
          ...q, 
          page_number: pageNumber,
          confidence_score: q.confidence_score || 1.0
        }));
      } catch (parseError) {
        console.error(`JSON parsing error on page ${pageNumber}:`, parseError);
        return [];
      }

    } catch (error: any) {
      retryCount++;
      if (error.message?.includes('429') || error.message?.includes('quota')) {
        console.log(`API key ${retryCount} hit rate limit, trying next key...`);
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      }
      throw error;
    }
  }
  
  throw new Error('All API keys exhausted for question extraction');
}

export async function performExtraction(
  imageBase64: string,
  pageNumber: number,
  previousContext: string = '',
  pageMemory: Map<number, string> = new Map()
): Promise<ExtractedQuestion[]> {
  const maxRetries = API_KEYS.length;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
    const apiKey = getNextApiKey();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.1,
        topK: 1,
        topP: 0.8,
      }
    });

    // Build memory context from previous pages
    const memoryContext = Array.from(pageMemory.entries())
      .slice(-3) // Keep last 3 pages in memory
      .map(([page, content]) => `Page ${page}: ${content.substring(0, 500)}...`)
      .join('\n\n');

    const enhancedPrompt = `
You are an EXPERT question extraction system for competitive exam papers. Extract ONLY actual questions with ABSOLUTE PRECISION.

MULTI-PAGE QUESTION HANDLING:
- CRITICAL: Some questions span multiple pages with long descriptions or multiple parts
- If you see an incomplete question (starts but doesn't end), mark it as spans_multiple_pages: true
- If you see a continuation of a question from previous page, mark it as is_continuation: true
- COMBINE multi-page questions into ONE complete question with full content
- For questions with parts (a, b, c), treat each part as a separate question with shared description

MEMORY CONTEXT FROM PREVIOUS PAGES:
${memoryContext}

PREVIOUS PAGE CONTEXT: ${previousContext}

CRITICAL RULES:
1. IGNORE general instructions, exam rules, or non-question content
2. Extract ONLY numbered questions (1, 2, 3, etc.) or lettered questions (a, b, c, etc.)
3. Include shared descriptions DIRECTLY in question_statement for each applicable question
4. Include diagram/table descriptions DIRECTLY in question_statement (don't separate them)
5. Convert math to LaTeX: use $ for inline math, $$ for display math
6. Question types: MCQ (single answer), MSQ (multiple answers), NAT (numerical), Subjective (descriptive)
7. For JSON: Use double backslashes (\\\\) for LaTeX commands, escape quotes as \\"
8. HANDLE IMAGES: If question has diagrams/images that cannot be described in text, mark has_image: true and provide detailed description

WHAT TO EXTRACT:
- Questions with numbers like "17.", "18.", "Q17", "Question 17"
- Include complete shared descriptions in each question's statement
- Include complete diagram/table descriptions in question statement
- Include all visual elements as text descriptions
- For multi-part questions (17a, 17b, 17c), create separate questions with shared description

WHAT TO IGNORE:
- General exam instructions
- Page headers/footers
- Non-question text
- Instructions that don't relate to specific questions

JSON FORMAT REQUIREMENTS:
- Use \\\\ for all LaTeX backslashes
- Escape quotes as \\"
- No line breaks in strings (use \\n if needed)
- Keep JSON simple and clean

RESPONSE FORMAT (CLEAN JSON ONLY):
[
  {
    "question_number": "17",
    "question_type": "MCQ",
    "question_statement": "Complete shared description + question statement + diagram/table descriptions all combined",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "is_continuation": false,
    "spans_multiple_pages": false,
    "has_image": false,
    "image_description": "Detailed description of any visual elements",
    "page_number": ${pageNumber}
  }
]

CRITICAL: Return ONLY valid JSON. No extra text, no explanations, just the JSON array.
`;

    const result = await model.generateContent([
      enhancedPrompt,
      {
        inlineData: {
          mimeType: 'image/png',
          data: imageBase64
        }
      }
    ]);

    const response = await result.response;
    const text = response.text();
    
    // Store this page's content in memory for future pages
    pageMemory.set(pageNumber, text.substring(0, 1000));
    
    // Robust JSON extraction
    const jsonContent = extractJsonFromText(text);
    if (!jsonContent) {
      console.log(`No questions found on page ${pageNumber}`);
      return [];
    }

    try {
      const questions = JSON.parse(jsonContent) as ExtractedQuestion[];
      return questions.map(q => ({ 
        ...q, 
        page_number: pageNumber,
        confidence_score: q.confidence_score || 1.0
      }));
    } catch (parseError) {
      console.error(`JSON parsing error on page ${pageNumber}:`, parseError);
      return [];
    }

    } catch (error: any) {
      console.error(`Error with API key ${retryCount} for page ${pageNumber}:`, error);
      
      if (error.message?.includes('429') || error.message?.includes('quota')) {
        console.log(`API key ${retryCount} hit rate limit for page ${pageNumber}, trying next key...`);
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      }
      
      if (retryCount >= maxRetries) {
        throw new Error(`All ${maxRetries} API keys exhausted for page ${pageNumber}: ${error.message}`);
      }
    }
  }
  
  throw new Error(`Failed to process page ${pageNumber} after trying all API keys`);
}

// Question Generation Functions
export async function generateQuestionsForTopic(
  topic: any,
  examName: string,
  courseName: string,
  questionType: 'MCQ' | 'MSQ' | 'NAT' | 'Subjective',
  pyqs: any[],
  existingQuestionsContext: string,
  recentlyGenerated: string[],
  count: number = 1
): Promise<ExtractedQuestion[]> {
  const maxRetries = API_KEYS.length;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      const apiKey = getNextApiKey();
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.9,
        }
      });

      // Build context from PYQs
      const pyqContext = pyqs.slice(0, 10).map((pyq, index) => 
        `PYQ ${index + 1}: ${pyq.question_statement}${pyq.options ? `\nOptions: ${pyq.options.join(', ')}` : ''}`
      ).join('\n\n');

      // Build context from recently generated
      const recentContext = recentlyGenerated.slice(-3).map((q, index) => 
        `Recent ${index + 1}: ${q.substring(0, 200)}...`
      ).join('\n\n');

      const questionTypeInstructions = {
        MCQ: 'Generate Multiple Choice Questions with exactly 4 options (A, B, C, D). Only ONE option should be correct. Ensure equal distribution of correct answers across options A, B, C, D over multiple questions.',
        MSQ: 'Generate Multiple Select Questions with 4-5 options. MORE THAN ONE option can be correct. Include partial marking scenarios.',
        NAT: 'Generate Numerical Answer Type questions where the answer is a number (integer or decimal). No options needed.',
        Subjective: 'Generate descriptive questions that require detailed explanations, proofs, or derivations. No options needed.'
      };

      const prompt = `
You are an expert question generator for ${examName} - ${courseName} entrance examination.

TOPIC: ${topic.name}
WEIGHTAGE: ${((topic.weightage || 0.02) * 100).toFixed(1)}% of total syllabus
QUESTION TYPE: ${questionType}

TOPIC NOTES (Use these concepts in solutions):
${topic.notes || 'No specific notes available'}

PREVIOUS YEAR QUESTIONS FROM THIS TOPIC:
${pyqContext || 'No PYQs available for this topic'}

EXISTING QUESTIONS ALREADY GENERATED FOR THIS TOPIC (${existingQuestionsContext ? existingQuestionsContext.split('\n\n').length : 0} questions):
${existingQuestionsContext || 'No existing questions generated yet for this topic'}

RECENTLY GENERATED QUESTIONS (Don't repeat):
${recentContext || 'No recent questions'}

INSTRUCTIONS:
1. ${questionTypeInstructions[questionType]}
2. Analyze the PYQ patterns and generate questions of SIMILAR or HIGHER difficulty
3. Use the same conceptual approach as the professor who set the PYQs
4. CRITICAL: DO NOT repeat any of the existing questions shown above - generate completely NEW and UNIQUE questions
5. Use different problem scenarios, numerical values, and contexts from existing questions
6. Ensure questions test deep understanding, not just memorization
7. For MCQ: Distribute correct answers equally across options A, B, C, D. ENSURE the correct answer is ALWAYS one of the 4 options.
8. For MSQ: Can have 1, 2, 3, or 4 correct options. ENSURE all correct answers are present in the options.
9. Include relevant formulas, concepts, and problem-solving approaches
10. Make questions challenging but fair for entrance exam level
11. Use LaTeX for mathematical expressions: $ for inline, $$ for display
12. Generate FRESH questions with different approaches, examples, and numerical values
13. Ensure the question difficulty matches the topic's weightage importance
14. CRITICAL: The answer must EXACTLY match one of the provided options (for MCQ) or be a combination of the provided options (for MSQ)

UNIQUENESS REQUIREMENTS:
- Use different numerical values from existing questions
- Apply concepts to different real-world scenarios
- Use different problem-solving approaches
- Create questions that test the same concepts but with fresh perspectives
- Avoid similar wording or structure to existing questions

ANSWER MATCHING REQUIREMENTS:
- For MCQ: The correct answer must be EXACTLY option A, B, C, or D
- For MSQ: The correct answers must be a combination like "A", "B,C", "A,C,D", etc.
- Keep mathematical expressions in standard form (π/3, not 1.047...)
- Ensure numerical answers match the format used in options
- If generating fractions, keep them in simplest form
- For expressions with constants, use standard mathematical notation

QUALITY REQUIREMENTS:
- Questions should be at entrance exam difficulty level
- Test conceptual understanding and application
- Include numerical problems, theoretical concepts, and application-based scenarios
- Ensure proper grammar and clear question statements
- Make distractors (wrong options) plausible but clearly incorrect
- Each question must be COMPLETELY DIFFERENT from all existing questions
- CRITICAL: Verify that the answer corresponds to one of the options before finalizing

Generate ${count} high-quality ${questionType} question(s) for this topic.

RESPONSE FORMAT (JSON only):
[
  {
    "question_statement": "Complete question with LaTeX math formatting",
    "question_type": "${questionType}",
    "options": ${questionType === 'MCQ' || questionType === 'MSQ' ? '["Option A", "Option B", "Option C", "Option D"]' : 'null'},
    "answer": "Correct answer(s) - for MCQ: single option like 'A', for MSQ: one or more like 'A', 'B,C', 'A,C,D', for NAT: numerical value, for Subjective: key points",
    "solution": "Detailed step-by-step solution using concepts from topic notes",
    "topic_id": "${topic.id}",
    "difficulty_level": "Medium"
  }
]

CRITICAL: 
- Return ONLY valid JSON. Use double backslashes (\\\\) for LaTeX commands.
- Generate UNIQUE questions that are COMPLETELY DIFFERENT from existing ones.
- Use the PYQs as reference for difficulty and style, but create original content.
- VERIFY that the answer matches the options before returning the response.
- For MSQ, ensure 1-4 options can be correct, not necessarily multiple.
`;

      const result = await model.generateContent([prompt]);
      const response = await result.response;
      const text = response.text();
      
      // Robust JSON extraction
      const jsonContent = extractJsonFromText(text);
      if (!jsonContent) {
        console.log(`No valid JSON found for topic ${topic.name}`);
        return [];
      }

      try {
        const questions = JSON.parse(jsonContent) as ExtractedQuestion[];
        return questions.map(q => ({ 
          ...q,
          confidence_score: 1.0
        }));
      } catch (parseError) {
        console.error(`JSON parsing error for topic ${topic.name}:`, parseError);
        return [];
      }

    } catch (error: any) {
      retryCount++;
      console.error(`Error with API key ${retryCount} for topic ${topic.name}:`, error);
      
      if (error.message?.includes('429') || error.message?.includes('quota')) {
        console.log(`API key ${retryCount} hit rate limit for topic ${topic.name}, trying next key...`);
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      }
      
      if (retryCount >= maxRetries) {
        throw new Error(`All ${maxRetries} API keys exhausted for topic ${topic.name}: ${error.message}`);
      }
    }
  }
  
  throw new Error(`Failed to generate questions for topic ${topic.name} after trying all API keys`);
}

// Answer validation functions
export function validateQuestionAnswer(question: ExtractedQuestion): { isValid: boolean; reason?: string } {
  const { question_type, options, answer } = question;
  
  if (!answer || answer.trim() === '') {
    return { isValid: false, reason: 'No answer provided' };
  }
  
  switch (question_type) {
    case 'MCQ':
      return validateMCQAnswer(options, answer);
    case 'MSQ':
      return validateMSQAnswer(options, answer);
    case 'NAT':
      return validateNATAnswer(answer);
    case 'Subjective':
      return validateSubjectiveAnswer(answer);
    default:
      return { isValid: false, reason: 'Unknown question type' };
  }
}

// Enhanced validation with correction capabilities
export async function validateAndCorrectQuestion(question: ExtractedQuestion): Promise<{ 
  isValid: boolean; 
  correctedQuestion?: ExtractedQuestion; 
  reason?: string 
}> {
  const validation = validateQuestionAnswer(question);
  
  if (validation.isValid) {
    return { isValid: true, correctedQuestion: question };
  }
  
  // Try to correct the question if validation failed
  if (question.question_type === 'MCQ' || question.question_type === 'MSQ') {
    try {
      const correctedQuestion = await correctQuestionOptions(question);
      const correctedValidation = validateQuestionAnswer(correctedQuestion);
      
      if (correctedValidation.isValid) {
        return { isValid: true, correctedQuestion };
      } else {
        return { isValid: false, reason: `Correction failed: ${correctedValidation.reason}` };
      }
    } catch (error) {
      return { isValid: false, reason: `Correction error: ${error.message}` };
    }
  }
  
  return { isValid: false, reason: validation.reason };
}

// Enhanced validation and fixing for bulk operations
export async function validateAndFixQuestion(question: ExtractedQuestion): Promise<{ 
  isValid: boolean; 
  correctedQuestion?: ExtractedQuestion; 
  reason?: string 
}> {
  // First, perform basic validation
  const basicValidation = validateQuestionAnswer(question);
  
  // Check if question statement and options make sense together
  const contentValidation = await validateQuestionContent(question);
  
  if (basicValidation.isValid && contentValidation.isValid) {
    return { isValid: true, correctedQuestion: question };
  }
  
  // Collect all issues
  const issues = [];
  if (!basicValidation.isValid) issues.push(basicValidation.reason);
  if (!contentValidation.isValid) issues.push(contentValidation.reason);
  
  // Try to fix the question
  try {
    const fixedQuestion = await fixQuestionIssues(question, issues);
    const fixedValidation = validateQuestionAnswer(fixedQuestion);
    const fixedContentValidation = await validateQuestionContent(fixedQuestion);
    
    if (fixedValidation.isValid && fixedContentValidation.isValid) {
      return { 
        isValid: true, 
        correctedQuestion: fixedQuestion,
        reason: `Fixed issues: ${issues.join(', ')}`
      };
    } else {
      return { 
        isValid: false, 
        reason: `Could not fix issues: ${issues.join(', ')}`
      };
    }
  } catch (error) {
    return { 
      isValid: false, 
      reason: `Fix attempt failed: ${error.message}. Original issues: ${issues.join(', ')}`
    };
  }
}

// Validate question content using AI
async function validateQuestionContent(question: ExtractedQuestion): Promise<{ 
  isValid: boolean; 
  reason?: string 
}> {
  const maxRetries = API_KEYS.length;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      const apiKey = getNextApiKey();
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: {
          temperature: 0.1,
          topK: 1,
          topP: 0.8,
        }
      });

      const prompt = `
You are an expert question validator. Analyze this ${question.question_type} question for correctness and consistency.

QUESTION: ${question.question_statement}
${question.options ? `OPTIONS: ${question.options.join(', ')}` : ''}
ANSWER: ${question.answer}
SOLUTION: ${question.solution || 'No solution provided'}

VALIDATION CHECKS:
1. Does the question statement make sense and is it complete?
2. For MCQ/MSQ: Do the options relate to the question? Are they plausible?
3. Does the provided answer actually match one of the options (for MCQ/MSQ)?
4. Is the answer mathematically/logically correct for the question?
5. Does the solution (if provided) lead to the correct answer?
6. Are there any obvious errors or inconsistencies?

RESPONSE FORMAT (JSON only):
{
  "isValid": true/false,
  "issues": ["List of specific issues found"],
  "correctAnswer": "What the correct answer should be (if different)",
  "explanation": "Brief explanation of the validation result"
}

CRITICAL: Return ONLY valid JSON. Be thorough but concise.
`;

      const result = await model.generateContent([prompt]);
      const response = await result.response;
      const text = response.text();
      
      const jsonContent = extractJsonFromText(text);
      if (!jsonContent) {
        return { isValid: false, reason: 'Could not validate question content' };
      }

      const validation = JSON.parse(jsonContent);
      
      return {
        isValid: validation.isValid,
        reason: validation.issues?.join(', ') || validation.explanation
      };

    } catch (error: any) {
      retryCount++;
      if (error.message?.includes('429') || error.message?.includes('quota')) {
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      }
      throw error;
    }
  }
  
  throw new Error('Failed to validate question content after trying all API keys');
}

// Fix question issues using AI
async function fixQuestionIssues(question: ExtractedQuestion, issues: string[]): Promise<ExtractedQuestion> {
  const maxRetries = API_KEYS.length;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      const apiKey = getNextApiKey();
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: {
          temperature: 0.3,
          topK: 20,
          topP: 0.8,
        }
      });

      const prompt = `
You are an expert question corrector. Fix the following ${question.question_type} question based on the identified issues.

ORIGINAL QUESTION: ${question.question_statement}
${question.options ? `ORIGINAL OPTIONS: ${question.options.join(', ')}` : ''}
ORIGINAL ANSWER: ${question.answer}
ORIGINAL SOLUTION: ${question.solution || 'No solution provided'}

IDENTIFIED ISSUES: ${issues.join(', ')}

FIXING INSTRUCTIONS:
1. Keep the question statement as close to original as possible
2. For MCQ: Ensure exactly ONE option is correct and matches the answer
3. For MSQ: Ensure the correct combination of options matches the answer
4. Fix mathematical errors in options or answer
5. Ensure options are plausible but only correct ones are actually right
6. Update solution to match the corrected answer
7. Maintain the same difficulty level and educational value

RESPONSE FORMAT (JSON only):
{
  "question_statement": "Corrected question statement",
  "question_type": "${question.question_type}",
  "options": ${question.options ? '["Corrected Option A", "Corrected Option B", "Corrected Option C", "Corrected Option D"]' : 'null'},
  "answer": "Corrected answer",
  "solution": "Corrected detailed solution"
}

CRITICAL: 
- Return ONLY valid JSON
- Use double backslashes (\\\\) for LaTeX commands
- Ensure the answer exactly matches the options for MCQ/MSQ
- Keep the same question type and educational intent
`;

      const result = await model.generateContent([prompt]);
      const response = await result.response;
      const text = response.text();
      
      const jsonContent = extractJsonFromText(text);
      if (!jsonContent) {
        throw new Error('No valid JSON response for question fixing');
      }

      const fixedQuestion = JSON.parse(jsonContent);
      
      return {
        ...question,
        question_statement: fixedQuestion.question_statement,
        options: fixedQuestion.options,
        answer: fixedQuestion.answer,
        solution: fixedQuestion.solution
      };

    } catch (error: any) {
      retryCount++;
      if (error.message?.includes('429') || error.message?.includes('quota')) {
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      }
      throw error;
    }
  }
  
  throw new Error('Failed to fix question issues after trying all API keys');
}

// Correct question options using AI
async function correctQuestionOptions(question: ExtractedQuestion): Promise<ExtractedQuestion> {
  const maxRetries = API_KEYS.length;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      const apiKey = getNextApiKey();
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: {
          temperature: 0.3,
          topK: 20,
          topP: 0.8,
        }
      });

      const prompt = `
You are an expert question corrector. The following ${question.question_type} question has an answer that doesn't match any of the provided options.

QUESTION: ${question.question_statement}
CURRENT OPTIONS: ${question.options?.join(', ')}
CORRECT ANSWER: ${question.answer}
QUESTION TYPE: ${question.question_type}

TASK: Fix the options to include the correct answer while maintaining educational value.

RULES:
1. For MCQ: Ensure exactly ONE of the 4 options matches the correct answer
2. For MSQ: Ensure the correct answer options are present (can be 1, 2, 3, or 4 options)
3. Keep mathematical expressions in their simplest, most standard form (e.g., π/3, not 1.047...)
4. Replace the LEAST relevant/most obviously wrong option with the correct answer
5. Maintain consistent formatting and difficulty level
6. Ensure all options are plausible but only the correct one(s) are actually correct
7. For MSQ, if answer is "A,C", ensure options A and C are correct, B and D are incorrect

CORRECTION STRATEGY:
- Identify which option is least relevant or most obviously incorrect
- Replace it with the correct answer in proper format
- Ensure the correct answer fits naturally with other options
- Maintain mathematical/scientific notation consistency

RESPONSE FORMAT (JSON only):
{
  "corrected_options": ["Option A", "Option B", "Option C", "Option D"],
  "explanation": "Brief explanation of what was corrected"
}

CRITICAL: Return ONLY valid JSON. Use double backslashes (\\\\) for LaTeX commands.
`;

      const result = await model.generateContent([prompt]);
      const response = await result.response;
      const text = response.text();
      
      const jsonContent = extractJsonFromText(text);
      if (!jsonContent) {
        throw new Error('No valid JSON response for correction');
      }

      const correction = JSON.parse(jsonContent);
      
      return {
        ...question,
        options: correction.corrected_options
      };

    } catch (error: any) {
      retryCount++;
      if (error.message?.includes('429') || error.message?.includes('quota')) {
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      }
      throw error;
    }
  }
  
  throw new Error('Failed to correct question options after trying all API keys');
}

function validateMCQAnswer(options: string[] | null, answer: string): { isValid: boolean; reason?: string } {
  if (!options || options.length === 0) {
    return { isValid: false, reason: 'No options provided for MCQ' };
  }
  
  const cleanAnswer = answer.trim().toUpperCase();
  const validOptions = ['A', 'B', 'C', 'D', 'E'];
  
  // Check if answer is a valid option letter
  if (!validOptions.includes(cleanAnswer)) {
    return { isValid: false, reason: `Answer "${answer}" is not a valid option (A, B, C, D, E)` };
  }
  
  // Check if the option index exists
  const optionIndex = cleanAnswer.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
  if (optionIndex >= options.length) {
    return { isValid: false, reason: `Answer "${answer}" refers to option ${optionIndex + 1} but only ${options.length} options provided` };
  }
  
  return { isValid: true };
}

function validateMSQAnswer(options: string[] | null, answer: string): { isValid: boolean; reason?: string } {
  if (!options || options.length === 0) {
    return { isValid: false, reason: 'No options provided for MSQ' };
  }
  
  const cleanAnswer = answer.trim().toUpperCase();
  const answerOptions = cleanAnswer.split(',').map(opt => opt.trim());
  const validOptions = ['A', 'B', 'C', 'D', 'E'];
  
  // Check if all answer options are valid letters
  for (const opt of answerOptions) {
    if (!validOptions.includes(opt)) {
      return { isValid: false, reason: `Answer option "${opt}" is not valid (A, B, C, D, E)` };
    }
    
    // Check if the option index exists
    const optionIndex = opt.charCodeAt(0) - 65;
    if (optionIndex >= options.length) {
      return { isValid: false, reason: `Answer option "${opt}" refers to option ${optionIndex + 1} but only ${options.length} options provided` };
    }
  }
  
  // MSQ can have 1 or more correct options (1, 2, 3, or 4)
  if (answerOptions.length < 1 || answerOptions.length > 4) {
    return { isValid: false, reason: 'MSQ should have 1-4 correct options' };
  }
  
  return { isValid: true };
}

function validateNATAnswer(answer: string): { isValid: boolean; reason?: string } {
  const cleanAnswer = answer.trim();
  
  // Check if answer is a number (integer or decimal)
  const numberRegex = /^-?\d+(\.\d+)?$/;
  if (!numberRegex.test(cleanAnswer)) {
    return { isValid: false, reason: `NAT answer "${answer}" is not a valid number` };
  }
  
  return { isValid: true };
}

function validateSubjectiveAnswer(answer: string): { isValid: boolean; reason?: string } {
  const cleanAnswer = answer.trim();
  
  // Subjective answers should have meaningful content (at least 10 characters)
  if (cleanAnswer.length < 10) {
    return { isValid: false, reason: 'Subjective answer is too short (minimum 10 characters)' };
  }
  
  return { isValid: true };
}
export async function generateSolutionsForPYQs(
  pyqs: any[],
  topicNotes: string
): Promise<ExtractedQuestion[]> {
  const maxRetries = API_KEYS.length;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      const apiKey = getNextApiKey();
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: {
          temperature: 0.3,
          topK: 20,
          topP: 0.8,
        }
      });

      const pyqsToSolve = pyqs.slice(0, 5); // Process up to 5 PYQs at once
      
      const pyqContext = pyqsToSolve.map((pyq, index) => 
        `PYQ ${index + 1}:
Question: ${pyq.question_statement}
${pyq.options ? `Options: ${pyq.options.join(', ')}` : ''}
Type: ${pyq.question_type}
Year: ${pyq.year || 'Unknown'}
`
      ).join('\n\n');

      const prompt = `
You are an expert solution generator for competitive exam questions.

TOPIC NOTES (Base your solutions on these concepts):
${topicNotes || 'Use standard concepts for this topic'}

PREVIOUS YEAR QUESTIONS TO SOLVE:
${pyqContext}

INSTRUCTIONS:
1. Generate accurate answers and detailed solutions for each PYQ
2. Base solutions on the provided topic notes and standard concepts
3. For MCQ/MSQ: Identify the correct option(s) and explain why others are wrong
4. For NAT: Provide the exact numerical answer with proper units
5. For Subjective: Provide comprehensive step-by-step solutions
6. Use LaTeX for mathematical expressions: $ for inline, $$ for display
7. Explain the reasoning and methodology clearly
8. Include relevant formulas and concepts from the topic notes
9. Make solutions educational and easy to understand

RESPONSE FORMAT (JSON only):
[
  {
    "answer": "Correct answer - for MCQ: 'A', for MSQ: 'A,C', for NAT: numerical value, for Subjective: key result",
    "solution": "Detailed step-by-step solution with LaTeX formatting"
  }
]

CRITICAL: Return ONLY valid JSON. Use double backslashes (\\\\) for LaTeX commands.
`;

      const result = await model.generateContent([prompt]);
      const response = await result.response;
      const text = response.text();
      
      // Robust JSON extraction
      const jsonContent = extractJsonFromText(text);
      if (!jsonContent) {
        console.log(`No valid JSON found for PYQ solutions`);
        return [];
      }

      try {
        const solutions = JSON.parse(jsonContent) as ExtractedQuestion[];
        return solutions;
      } catch (parseError) {
        console.error(`JSON parsing error for PYQ solutions:`, parseError);
        return [];
      }

    } catch (error: any) {
      retryCount++;
      console.error(`Error with API key ${retryCount} for PYQ solutions:`, error);
      
      if (error.message?.includes('429') || error.message?.includes('quota')) {
        console.log(`API key ${retryCount} hit rate limit for PYQ solutions, trying next key...`);
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      }
      
      if (retryCount >= maxRetries) {
        throw new Error(`All ${maxRetries} API keys exhausted for PYQ solutions: ${error.message}`);
      }
    }
  }
  
  throw new Error(`Failed to generate PYQ solutions after trying all API keys`);
}

// Robust JSON extraction helper function
function extractJsonFromText(text: string): string | null {
  // First try to find JSON in code blocks
  const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  
  // Find the first occurrence of [ or {
  let startIndex = -1;
  let startChar = '';
  
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '[' || text[i] === '{') {
      startIndex = i;
      startChar = text[i];
      break;
    }
  }
  
  if (startIndex === -1) {
    return null;
  }
  
  // Find the matching closing bracket/brace
  const endChar = startChar === '[' ? ']' : '}';
  let endIndex = -1;
  
  for (let i = text.length - 1; i >= startIndex; i--) {
    if (text[i] === endChar) {
      endIndex = i;
      break;
    }
  }
  
  if (endIndex === -1) {
    return null;
  }
  
  return text.substring(startIndex, endIndex + 1);
}