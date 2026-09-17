'use client';

/**
 * AI Matchmaker Client Page
 * 
 * Interactive Chat UI connecting students with mentors through intelligent AI analysis.
 * 
 * Features:
 * - Multi-turn conversational flow grounded in platform mentors & skills
 * - Quick prompt starter chips for instant one-click queries
 * - Mentorship economy notice when student owes mentorships
 * - Live mentor recommendation cards with 1-click mentorship request capability
 * - Auto-scrolling, typing state indicators, and responsive mobile-first layout
 */

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import type { RecommendedMentor } from './actions';
import MatchmakerMentorCard from './MatchmakerMentorCard';
import { Sparkles, ArrowLeft, Send, Compass, BookOpen, AlertTriangle } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  recommendations?: RecommendedMentor[];
  notice?: string;
}

const STARTER_PROMPTS = [
  'I want to master React and build modern web apps',
  'Who can mentor me in Python and Machine Learning?',
  'Looking for a mentor to guide my portfolio project',
  'I need help with Node.js and PostgreSQL backend APIs',
];

export default function MatchmakerPage() {
  // Conversation timeline state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      role: 'assistant',
      content:
        "Hi! I'm your AI Matchmaker on PassItOn. Tell me about what you'd like to learn, your current background, or any target projects you want to build. I'll recommend the best mentors from our verified community!",
    },
  ]);

  // Input state
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Auto-scroll ref
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const msgCounterRef = useRef(1);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, isLoading]);

  /**
   * Dispatches the user's message to the server-side AI matchmaker action
   */
  const submitMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    msgCounterRef.current += 1;
    const userMsgId = `user-msg-${msgCounterRef.current}`;

    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: textToSend.trim(),
    };

    msgCounterRef.current += 1;
    const aiMsgId = `ai-msg-${msgCounterRef.current}`;

    const updatedHistory = [...messages, userMessage];
    // Pre-insert assistant message to receive real-time streaming tokens
    setMessages([...updatedHistory, { id: aiMsgId, role: 'assistant', content: '' }]);
    setInputValue('');
    setIsLoading(true);

    try {
      const historyContext = updatedHistory.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Call streaming Route Handler via fetch
      const response = await fetch('/api/matchmaker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: userMessage.content,
          messageHistory: historyContext,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Failed to connect to matchmaker: HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const events = sseBuffer.split('\n\n');
        // Keep trailing partial event chunk in buffer
        sseBuffer = events.pop() || '';

        for (const eventBlock of events) {
          const trimmed = eventBlock.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.replace(/^data:\s*/, '');

          try {
            const data = JSON.parse(jsonStr);

            if (data.type === 'token') {
              // Append incremental token text to the active assistant message
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId ? { ...m, content: m.content + data.content } : m
                )
              );
            } else if (data.type === 'done') {
              // Terminal done event carries final narrative and structured mentor recommendation cards
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId
                    ? {
                        ...m,
                        content: data.text || m.content,
                        recommendations: data.recommendations,
                        notice: data.notice,
                      }
                    : m
                )
              );
            } else if (data.type === 'error') {
              throw new Error(data.message || 'Streaming error');
            }
          } catch (parseErr) {
            console.warn('Could not parse SSE chunk:', parseErr);
          }
        }
      }
    } catch (err) {
      console.error('Failed to get matchmaker response:', err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? {
                ...m,
                content:
                  m.content ||
                  "I had trouble connecting to the mentor database. Please try again or browse mentors directly from the search tab.",
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMessage(inputValue);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] max-w-4xl mx-auto bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
      
      {/* Header Bar */}
      <div className="bg-slate-900 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/user/search"
            id="back-to-search-btn"
            className="text-slate-400 hover:text-white transition-colors p-1 -ml-1 rounded-lg hover:bg-slate-800"
            title="Back to manual search"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              AI Matchmaker
            </h1>
            <p className="text-xs text-slate-400 hidden sm:block">
              Pairing you with experienced peer mentors based on your learning goals
            </p>
          </div>
        </div>

        <Link
          href="/user/search"
          className="text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          Browse All Mentors
        </Link>
      </div>

      {/* Messages Timeline */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-50"
      >
        {messages.filter((msg) => msg.content.length > 0).map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex gap-3 sm:gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar Icon */}
              <div className="flex-shrink-0">
                {isUser ? (
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-800 text-white font-semibold text-xs flex items-center justify-center shadow-xs">
                    YOU
                  </div>
                ) : (
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                    <Sparkles className="w-4 h-4" />
                  </div>
                )}
              </div>

              {/* Message Bubble + Structured Recommendations */}
              <div
                className={`space-y-3 max-w-[85%] sm:max-w-[78%] ${
                  isUser ? 'items-end text-right' : 'items-start'
                }`}
              >
                <div
                  className={`rounded-2xl p-4 shadow-xs text-sm sm:text-base leading-relaxed ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-tr-xs text-left'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>

                {/* Mentorship Economy Notice Banner */}
                {msg.notice && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <span>{msg.notice}</span>
                  </div>
                )}

                {/* Recommended Mentor Cards */}
                {msg.recommendations && msg.recommendations.length > 0 && (
                  <div className="space-y-3 pt-1 w-full text-left">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <Compass className="w-3.5 h-3.5 text-indigo-500" />
                      Recommended Mentors from Community:
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      {msg.recommendations.map((mentor) => (
                        <MatchmakerMentorCard key={mentor.id} mentor={mentor} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Loading Indicator: Shown before initial token arrives */}
        {isLoading && (!messages[messages.length - 1] || messages[messages.length - 1].content === '') && (
          <div className="flex gap-3 sm:gap-4 flex-row items-center">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center opacity-70 animate-pulse">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="bg-white border border-slate-200 text-slate-500 rounded-2xl rounded-tl-xs p-3.5 shadow-xs flex items-center gap-2 text-xs font-medium">
              <span>Matching against verified mentors</span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.4s]" />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Starter Suggestions & Input Form */}
      <div className="bg-white border-t border-slate-200 p-3 sm:p-4 space-y-3 flex-shrink-0">
        {/* Quick starter chips shown when message count is low */}
        {messages.length <= 2 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1 flex-shrink-0">
              <BookOpen className="w-3 h-3" /> Try:
            </span>
            {STARTER_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => submitMessage(prompt)}
                disabled={isLoading}
                className="text-xs bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 px-3 py-1 rounded-full whitespace-nowrap transition-colors border border-slate-200 hover:border-indigo-200 disabled:opacity-50 cursor-pointer"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* Input bar */}
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            id="matchmaker-user-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isLoading}
            placeholder={isLoading ? "AI is analyzing community mentors..." : "Tell the AI what you want to learn..."}
            className="w-full bg-slate-50 border border-slate-300 rounded-full py-3 sm:py-3.5 pl-4 sm:pl-6 pr-14 sm:pr-16 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm sm:text-base"
          />
          <button
            id="matchmaker-send-btn"
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="absolute right-1.5 sm:right-2 w-9 h-9 sm:w-10 sm:h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs"
            title="Send Message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        <p className="text-center text-[11px] text-slate-400">
          PassItOn AI Matchmaker connects you directly with verified peer mentors.
        </p>
      </div>
    </div>
  );
}
