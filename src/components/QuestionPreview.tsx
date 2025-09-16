import React from 'react';
import { BlockMath, InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { ExtractedQuestion } from '../lib/gemini';
import { FileText, CheckCircle, Circle, Hash, Edit3, Trash2, ImagePlus, Image } from 'lucide-react';

interface QuestionPreviewProps {
  question: ExtractedQuestion;
  index: number;
  onDelete?: () => void;
  onImageUpload?: (imageBase64: string) => void;
  showControls?: boolean;
}

export function QuestionPreview({ question, index, onDelete, onImageUpload, showControls = false }: QuestionPreviewProps) {
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && onImageUpload) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        onImageUpload(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const getQuestionTypeIcon = (type: string) => {
    switch (type) {
      case 'MCQ':
        return <Circle className="w-5 h-5 text-blue-500" />;
      case 'MSQ':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'NAT':
        return <Hash className="w-5 h-5 text-orange-500" />;
      case 'Subjective':
        return <Edit3 className="w-5 h-5 text-purple-500" />;
      default:
        return <FileText className="w-5 h-5 text-gray-500" />;
    }
  };

  const getQuestionTypeColor = (type: string) => {
    switch (type) {
      case 'MCQ':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'MSQ':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'NAT':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Subjective':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const renderMathContent = (content: string) => {
    if (!content) return null;
    
    // Enhanced math content rendering with better LaTeX support
    const parts = content.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]*?\$)/);
    
    return parts.map((part, i) => {
      if (part.startsWith('$$') && part.endsWith('$$')) {
        // Display math
        const math = part.slice(2, -2);
        try {
          return (
            <div key={i} className="my-4">
              <BlockMath math={math} />
            </div>
          );
        } catch (error) {
          console.error('LaTeX rendering error (display):', error, 'Math:', math);
          return <div key={i} className="my-4 p-2 bg-red-50 border border-red-200 rounded text-red-700">LaTeX Error: {math}</div>;
        }
      } else if (part.startsWith('$') && part.endsWith('$')) {
        // Inline math
        const math = part.slice(1, -1);
        try {
          return <InlineMath key={i} math={math} />;
        } catch (error) {
          console.error('LaTeX rendering error (inline):', error, 'Math:', math);
          return <span key={i} className="px-1 bg-red-50 border border-red-200 rounded text-red-700">{part}</span>;
        }
      } else {
        // Regular text
        return <span key={i} className="whitespace-pre-wrap">{part}</span>;
      }
    });
  };

  return (
    <div className="border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-all bg-gradient-to-r from-white to-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-r from-purple-100 to-indigo-100 p-2 rounded-lg">
            <span className="text-sm font-bold text-purple-700">Q{index}</span>
          </div>
          {question.question_number && (
            <div className="text-sm text-gray-500">
              Original: {question.question_number}
            </div>
          )}
          <div className="text-xs text-gray-400">
            Page {question.page_number}
          </div>
          {question.has_image && (
            <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
              <Image className="w-3 h-3" />
              <span>Has Image</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-sm font-medium ${getQuestionTypeColor(question.question_type)}`}>
            {getQuestionTypeIcon(question.question_type)}
            {question.question_type}
          </div>
          
          {showControls && (
            <div className="flex items-center gap-2">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <div className="flex items-center gap-1 px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm font-medium transition-colors">
                  <ImagePlus className="w-4 h-4" />
                  Add Image
                </div>
              </label>
              
              {onDelete && (
                <button
                  onClick={onDelete}
                  className="flex items-center gap-1 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Question Statement */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Question:</h3>
        <div className="bg-white p-4 rounded-lg border border-gray-100 text-gray-700 leading-relaxed">
          {renderMathContent(question.question_statement)}
        </div>
      </div>

      {/* Uploaded Image */}
      {question.uploaded_image && (
        <div className="mb-4">
          <h4 className="text-md font-semibold text-gray-800 mb-3">Question Image:</h4>
          <div className="bg-white p-4 rounded-lg border border-gray-100">
            <img 
              src={question.uploaded_image} 
              alt="Question diagram" 
              className="max-w-full h-auto rounded-lg shadow-sm"
            />
          </div>
        </div>
      )}

      {/* Image Description */}
      {question.image_description && (
        <div className="mb-4">
          <h4 className="text-md font-semibold text-gray-800 mb-3">Image Description:</h4>
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 text-blue-800 text-sm">
            {question.image_description}
          </div>
        </div>
      )}

      {/* Options */}
      {question.options && question.options.length > 0 && (
        <div>
          <h4 className="text-md font-semibold text-gray-800 mb-3">Options:</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {question.options.map((option, optionIndex) => (
              <div
                key={optionIndex}
                className="bg-white p-3 rounded-lg border border-gray-100 hover:border-purple-200 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="bg-gradient-to-r from-purple-100 to-indigo-100 text-purple-700 w-6 h-6 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 mt-0.5">
                    {String.fromCharCode(65 + optionIndex)}
                  </div>
                  <div className="text-gray-700 flex-1">
                    {renderMathContent(option)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Continuation Indicator */}
      {question.is_continuation && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2 text-yellow-800 text-sm">
            <FileText className="w-4 h-4" />
            <span>This question continues from the previous page</span>
          </div>
        </div>
      )}

      {/* Multi-page Indicator */}
      {question.spans_multiple_pages && (
        <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="flex items-center gap-2 text-orange-800 text-sm">
            <FileText className="w-4 h-4" />
            <span>This question spans multiple pages</span>
          </div>
        </div>
      )}
    </div>
  );
}