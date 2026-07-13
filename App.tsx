import React, { useState, useRef, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { supabase } from './lib/supabaseClient';
import {
  Shield, FileText, CheckCircle, RefreshCw, Layers, Users, Trash2, Play,
  CreditCard, LayoutDashboard, Building2, UploadCloud, Check, Sparkles,
  Scale, DollarSign, History, UserPlus, UserMinus, ShieldAlert, Globe,
  AlertTriangle, TrendingUp, Clock, ChevronRight, Search, Bell,
  FileCheck, Gavel, Zap, ArrowUpRight, ArrowDownRight, X, Download, LogOut, Loader2,
} from 'lucide-react';

// pdfjs يحتاج ملف worker منفصل ليعمل بكفاءة دون تجميد الواجهة أثناء القراءة
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// استخراج النص الفعلي من ملف PDF مرفوع (وليس نصاً وهمياً ثابتاً)
async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    fullText += pageText + '\n';
  }
  return fullText.trim();
}

// ========================================================
// 🔒 1. موجه الأوامر الخلفي الصارم ومحددات الـ JSON (System Prompt Backend)
// ========================================================
const SAUDI_LEGAL_AI_PROMPT = `
أنت مستشار قانوني سعودي خارق الذكاء وخبير في ثغرات نظام العمل المحدث لعام 2026.
مهمتك هي تحليل نص العقد المدخل ديناميكياً (Dynamic Parsing) وتفكيك أي حيل أو بنود ملتوية لحماية حقوق الأطراف وفقاً لقواعد النظام العام السعودي.
يجب أن تقوم بفحص النص بدقة وإعادة مصفوفة JSON تحتوي على التحليل القانوني والمقارنة الذكية (Diff-Check) وفق القواعد الصارمة التالية:
1. فحص فترة التجربة (المادة 53 و54): الحد الأقصى الافتراضي هو 90 يوماً. أي نص يحددها بـ 6 أشهر أو 180 يوماً بشكل تلقائي دون شرط "الاتفاق المكتوب المستقل بعد مباشرة العمل" يعتبر مخالفاً فوراً (non-compliant).
2. فحص بند عدم المنافسة (المادة 83): الحد الأقصى سنتين، ويجب تحديد المكان ونوع العمل بدقة. أي إطلاق أبدي أو جغرافي شامل يجعله باطلاً ومخالفاً.
3. فحص ساعات العمل والإضافي (المادة 98/101/107): الساعات الفعلية 8 يومياً، ولا يعمل العامل أكثر من 5 ساعات متصلة دون راحة لا تقل عن نصف ساعة. احتساب الإضافي بأجر الساعة + 50% من الأساسي.
4. فحص الإجازات ومكافأة الخدمة (المادة 84/85/109): الإجازة لا تقل عن 21 يوماً، والتنازل عن مكافأة نهاية الخدمة باطل بطلاناً مطلقاً.
5. حظر اللجوء للقضاء (المادة 5): أي بند يجبر العامل على التنازل عن حقه في التقاضي أمام المحاكم العمالية السعودية، أو يلزمه باللجوء حصرياً لتحكيم تجاري خاص مدفوع الكلفة مناصفة، هو بند باطل ومعدوم قانوناً.
`;

interface AuditIssue {
  id: string;
  article_reference: string;
  severity: 'High' | 'Medium' | 'Low';
  status: 'compliant' | 'non-compliant';
  original_text: string;
  suggested_text: string;
  why_explanation: string;
  courtPrediction: string;
  financialRisk: number;
}

interface AuditReport {
  score: number;
  status: string;
  riskMatrix: { high: number; medium: number; low: number };
  totalFinancialLiability: number;
  timestamp: string;
  issues: AuditIssue[];
}

interface Subsidiary {
  id: string;
  name: string;
  contracts: number;
  compliance: number;
  status: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

type TabKey = 'dashboard' | 'holdings' | 'team' | 'billing';

const severityConfig: Record<AuditIssue['severity'], { label: string; color: string; bg: string; border: string; dot: string }> = {
  High: { label: 'خطورة عالية', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', dot: 'bg-red-500' },
  Medium: { label: 'خطورة متوسطة', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', dot: 'bg-amber-500' },
  Low: { label: 'خطورة منخفضة', color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/30', dot: 'bg-sky-500' },
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 }).format(amount);

export default function SaudiLegalCombinedSaaS() {
  // ===== حالة المصادقة الحقيقية (Supabase Auth) =====
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
        if (error) throw error;
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const [currentTab, setCurrentTab] = useState<TabKey>('dashboard');
  const [contractText, setContractText] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: string; name: string; date: string; score: number }[]>([
    { id: 'h1', name: 'عقد توظيف — مدير عمليات', date: '2026-07-09 14:32', score: 92 },
    { id: 'h2', name: 'عقد استشاري — قسم المالية', date: '2026-07-08 10:15', score: 76 },
    { id: 'h3', name: 'مذكرة تفاهم — شركة شريك', date: '2026-07-05 09:00', score: 88 },
  ]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [team, setTeam] = useState<TeamMember[]>([
    { id: '1', name: 'أ. عبد الرحمن الشمري', email: 'a.shammari@saudilegal.ai', role: 'محامي رئيسي' },
    { id: '2', name: 'سارة القحطاني', email: 's.qahtani@saudilegal.ai', role: 'مسؤول موارد بشرية' },
    { id: '3', name: 'م. خالد العتيبي', email: 'k.otaibi@saudilegal.ai', role: 'مستشار قانوني' },
  ]);

  const [subsidiaries] = useState<Subsidiary[]>([
    { id: '1', name: 'شركة التجزئة المتطورة المحدودة', contracts: 14, compliance: 92, status: 'مستقر' },
    { id: '2', name: 'المجموعة الوطنية للخدمات اللوجستية', contracts: 8, compliance: 42, status: 'خطر عالي' },
    { id: '3', name: 'شركة التقنية الرقمية القابضة', contracts: 21, compliance: 78, status: 'تحت المراقبة' },
    { id: '4', name: 'مؤسسة البناء الحديث', contracts: 5, compliance: 100, status: 'ممتثل' },
  ]);

  const handleClearAllPrevious = () => {
    setReport(null);
    setIsLoading(false);
    setAnalysisError(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleInputChange = (text: string) => {
    setContractText(text);
    if (report) handleClearAllPrevious();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleClearAllPrevious();
    setAnalysisError(null);
    setIsLoading(true);
    try {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const text = await extractTextFromPdf(file);
        if (!text) {
          setAnalysisError('لم يتم العثور على نص قابل للقراءة داخل ملف الـ PDF (قد يكون صورة ممسوحة ضوئياً بدون طبقة نص).');
        } else {
          setContractText(text);
          setSelectedFile(file);
        }
      } else if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
        const text = await file.text();
        setContractText(text);
        setSelectedFile(file);
      } else {
        setAnalysisError('صيغة DOCX غير مدعومة بعد في القراءة الفعلية — الرجاء استخدام PDF أو TXT حالياً، أو لصق النص مباشرة.');
      }
    } catch (err) {
      setAnalysisError(err instanceof Error ? `فشل قراءة الملف: ${err.message}` : 'فشل قراءة الملف.');
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAnalyzeContract = async () => {
    if (!contractText.trim() || !session) return;
    handleClearAllPrevious();
    setAnalysisError(null);
    setIsLoading(true);

    try {
      // 1) جلب company_id الخاص بالمستخدم الحالي
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', session.user.id)
        .single();
      if (profileError || !profile?.company_id) {
        throw new Error('حسابك غير مرتبط بأي شركة بعد. الرجاء إتمام إعداد الشركة أولاً.');
      }

      // 2) رفع الملف الأصلي إلى Storage الخاص (إن وُجد ملف مرفوع فعلياً)
      let storagePath = 'pasted-text/no-file.txt';
      if (selectedFile) {
        storagePath = `${profile.company_id}/${Date.now()}_${selectedFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from('contracts')
          .upload(storagePath, selectedFile);
        if (uploadError) throw new Error(`فشل رفع الملف إلى التخزين: ${uploadError.message}`);
      }

      // 3) إنشاء سجل العقد في قاعدة البيانات
      const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .insert({
          company_id: profile.company_id,
          uploaded_by: session.user.id,
          file_name: selectedFile?.name ?? 'نص ملصوق يدوياً',
          storage_path: storagePath,
          status: 'processing',
        })
        .select()
        .single();
      if (contractError || !contract) throw new Error(`فشل إنشاء سجل العقد: ${contractError?.message}`);

      // 4) استدعاء Edge Function للتحليل الفعلي عبر AI
      const { data: fnData, error: fnError } = await supabase.functions.invoke('analyze-contract', {
        body: { contractId: contract.id, contractText },
      });
      if (fnError) throw new Error(`فشل التحليل: ${fnError.message}`);
      if (fnData?.error) throw new Error(fnData.error);

      // 5) تحويل نتيجة الخادم إلى شكل الواجهة المحلي
      const serverReport = fnData.report;
      const serverIssues: Array<Record<string, unknown>> = fnData.issues ?? [];
      setReport({
        score: serverReport.score,
        status: serverReport.status_summary,
        riskMatrix: {
          high: serverReport.risk_high,
          medium: serverReport.risk_medium,
          low: serverReport.risk_low,
        },
        totalFinancialLiability: serverReport.total_financial_liability,
        timestamp: new Date(serverReport.created_at).toLocaleString('ar-SA'),
        issues: serverIssues.map((issue, idx) => ({
          id: String(idx + 1),
          article_reference: String(issue.article_reference ?? ''),
          severity: (issue.severity as AuditIssue['severity']) ?? 'Low',
          status: (issue.status as AuditIssue['status']) ?? 'non-compliant',
          original_text: String(issue.original_text ?? ''),
          suggested_text: String(issue.suggested_text ?? ''),
          why_explanation: String(issue.why_explanation ?? ''),
          courtPrediction: String(issue.court_prediction ?? ''),
          financialRisk: Number(issue.financial_risk) || 0,
        })),
      });
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء التحليل.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyFix = (issueId: string, suggested: string, original: string) => {
    setContractText((prev) => prev.replace(original, suggested));
    if (report) {
      const updatedIssues = report.issues.filter((issue) => issue.id !== issueId);
      const solvedIssue = report.issues.find((issue) => issue.id === issueId);
      const removedLiability = solvedIssue ? solvedIssue.financialRisk : 0;

      setReport({
        ...report,
        score: Math.min(100, report.score + 24),
        totalFinancialLiability: Math.max(0, report.totalFinancialLiability - removedLiability),
        issues: updatedIssues,
        riskMatrix: { ...report.riskMatrix, high: Math.max(0, report.riskMatrix.high - 1) },
        status: updatedIssues.length === 0 ? 'متوافق وممتثل بالكامل (0% مخاطر عمالية)' : report.status,
      });
    }
  };

  const navItems: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
    { key: 'holdings', label: 'الشركات القابضة', icon: Building2 },
    { key: 'team', label: 'فريق العمل', icon: Users },
    { key: 'billing', label: 'الفوترة والاشتراك', icon: CreditCard },
  ];

  const stats = [
    { label: 'العقود المدققة', value: '247', change: '+12%', up: true, icon: FileCheck },
    { label: 'معدل الامتثال', value: '84%', change: '+5%', up: true, icon: Shield },
    { label: 'المخاطر المكتشفة', value: '38', change: '-8', up: false, icon: AlertTriangle },
    { label: 'الالتزامات المالية', value: '320K', change: '-15%', up: false, icon: DollarSign },
  ];

  // ===== شاشة التحميل الأولي أثناء التحقق من الجلسة =====
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#05070e] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  // ===== شاشة تسجيل الدخول / إنشاء حساب (تظهر فقط إن لم يكن هناك جلسة) =====
  if (!session) {
    return (
      <div dir="rtl" className="min-h-screen bg-[#05070e] flex items-center justify-center p-4 font-sans">
        <div className="w-full max-w-sm bg-gradient-to-br from-slate-900/80 to-slate-900/30 border border-slate-800/60 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 via-indigo-600 to-emerald-500 flex items-center justify-center shadow-lg">
              <Scale className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-md font-black text-white">
              SaudiLegal<span className="text-indigo-400 font-bold">.ai</span>
            </h1>
          </div>

          <div className="flex mb-6 bg-slate-950/60 rounded-xl p-1 border border-slate-800">
            <button
              onClick={() => setAuthMode('signin')}
              className={`flex-1 py-2 rounded-lg text-xs font-black transition-colors ${authMode === 'signin' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
            >
              تسجيل الدخول
            </button>
            <button
              onClick={() => setAuthMode('signup')}
              className={`flex-1 py-2 rounded-lg text-xs font-black transition-colors ${authMode === 'signup' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
            >
              حساب جديد
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-3">
            <input
              type="email"
              required
              placeholder="البريد الإلكتروني"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-600/50"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="كلمة المرور (6 أحرف على الأقل)"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-600/50"
            />
            {authError && <p className="text-xs text-red-400">{authError}</p>}
            <button
              type="submit"
              disabled={authSubmitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-black bg-gradient-to-l from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-900/40 disabled:opacity-50 transition-all"
            >
              {authSubmitting && <RefreshCw className="w-4 h-4 animate-spin" />}
              {authMode === 'signin' ? 'دخول' : 'إنشاء الحساب'}
            </button>
          </form>
          {authMode === 'signup' && (
            <p className="text-[11px] text-slate-500 mt-4 leading-relaxed">
              بعد إنشاء الحساب، سيحتاج مديرك أو المسؤول لربطك بشركة (company_id) قبل أن تتمكن من رفع العقود — هذه الخطوة التالية في الإعداد.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05070e] text-slate-200 flex font-sans antialiased" dir="rtl">
      {/* 1. الجانبية الثابتة الفاخرة المدمجة (Premium Sticky Sidebar Nav) */}
      <aside className="w-72 bg-[#090e1a] border-l border-slate-900 flex flex-col fixed top-0 bottom-0 right-0 z-20 shadow-2xl">
        <div className="p-6 border-b border-slate-800/50 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 via-indigo-600 to-emerald-500 flex items-center justify-center shadow-lg">
            <Scale className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-md font-black text-white">
              SaudiLegal<span className="text-indigo-400 font-bold">.ai</span>
            </h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">نظام الحوكمة والامتثال الأقصى</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1.5 pt-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setCurrentTab(item.key)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-300 group ${
                  active
                    ? 'bg-gradient-to-l from-indigo-600/30 to-indigo-600/5 text-white border border-indigo-500/40 shadow-lg shadow-indigo-900/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40 border border-transparent'
                }`}
              >
                <Icon className={`w-5 h-5 transition-transform ${active ? 'scale-110 text-indigo-400' : 'group-hover:scale-110'}`} />
                <span>{item.label}</span>
                {active && <ChevronRight className="w-4 h-4 mr-auto text-indigo-400 rotate-180" />}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800/50 space-y-3">
          <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900/40 border border-indigo-700/30 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-white">الخطة المؤسسية</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">ترخيص متعدد المقاعد مع دعم المجموعات القابضة والمراجعة المستمرة.</p>
            <button className="mt-3 w-full text-xs font-bold text-indigo-300 hover:text-white transition-colors flex items-center justify-center gap-1">
              ترقية الخطة <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-xs font-black flex-shrink-0">
              {session.user.email?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">{session.user.email}</p>
              <p className="text-[10px] text-slate-500 truncate">مستخدم مسجّل دخول</p>
            </div>
            <button onClick={handleSignOut} title="تسجيل الخروج">
              <LogOut className="w-4 h-4 text-slate-500 hover:text-red-400 cursor-pointer transition-colors" />
            </button>
          </div>
        </div>
      </aside>

      {/* 2. المنطقة الرئيسية */}
      <main className="flex-1 mr-72 min-h-screen">
        {/* Top Bar */}
        <header className="sticky top-0 z-10 bg-[#05070e]/80 backdrop-blur-xl border-b border-slate-900/80 px-8 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-white">{navItems.find((n) => n.key === currentTab)?.label}</h2>
            <p className="text-xs text-slate-500 mt-0.5">مراقبة الامتثال القانوني وفق نظام العمل السعودي المحدث 2026</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative hidden md:block">
              <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="بحث في العقود..."
                className="w-56 bg-slate-900/60 border border-slate-800 rounded-lg pr-9 pl-3 py-2 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-600/50 transition-colors"
              />
            </div>
            <button className="relative w-10 h-10 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-center hover:border-slate-700 transition-colors">
              <Bell className="w-4 h-4 text-slate-400" />
              <span className="absolute top-2 left-2 w-2 h-2 bg-red-500 rounded-full" />
            </button>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold text-emerald-300">النظام يعمل</span>
            </div>
          </div>
        </header>

        <div className="p-8">
          {/* ===================== DASHBOARD ===================== */}
          {currentTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <div
                      key={stat.label}
                      className="bg-gradient-to-br from-slate-900/80 to-slate-900/30 border border-slate-800/60 rounded-2xl p-5 hover:border-slate-700 transition-all duration-300 group"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800/60 flex items-center justify-center group-hover:bg-indigo-900/40 transition-colors">
                          <Icon className="w-5 h-5 text-slate-400 group-hover:text-indigo-400 transition-colors" />
                        </div>
                        <span
                          className={`text-xs font-bold flex items-center gap-0.5 ${
                            stat.up ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {stat.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {stat.change}
                        </span>
                      </div>
                      <p className="text-2xl font-black text-white">{stat.value}</p>
                      <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Contract Analyzer */}
                <div className="xl:col-span-2 bg-gradient-to-br from-slate-900/80 to-slate-900/30 border border-slate-800/60 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-white">محرك تحليل العقود الذكي</h3>
                        <p className="text-[11px] text-slate-500">فحص ديناميكي — Diff-Check وفق نظام العمل 2026</p>
                      </div>
                    </div>
                    <button
                      onClick={handleClearAllPrevious}
                      className="text-xs font-bold text-slate-400 hover:text-red-400 flex items-center gap-1.5 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      تصفير
                    </button>
                  </div>

                  {/* Upload area */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="mb-4 border-2 border-dashed border-slate-700 hover:border-indigo-600/50 rounded-xl p-4 cursor-pointer transition-colors group flex items-center gap-3"
                  >
                    <div className="w-10 h-10 rounded-lg bg-slate-800/60 group-hover:bg-indigo-900/30 flex items-center justify-center transition-colors">
                      <UploadCloud className="w-5 h-5 text-slate-400 group-hover:text-indigo-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-slate-300">رفع ملف العقد (PDF / DOCX)</p>
                      <p className="text-[10px] text-slate-500">سيتم استخراج النص آلياً وتعبئة الحقل أدناه</p>
                    </div>
                    <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" onChange={handleFileUpload} className="hidden" />
                  </div>

                  <textarea
                    value={contractText}
                    onChange={(e) => handleInputChange(e.target.value)}
                    placeholder="الصق نص العقد هنا أو ارفع ملفاً للبدء... سيقوم المحرك بتفكيك البنود وكشف الثغرات تلقائياً."
                    className="w-full h-40 bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-600/50 transition-colors resize-none leading-relaxed"
                  />

                  <div className="flex items-center justify-between mt-4">
                    <p className="text-[11px] text-slate-500">
                      {contractText ? `${contractText.length} حرف — جاهز للفحص` : 'في انتظار إدخال نص العقد'}
                    </p>
                    <button
                      onClick={handleAnalyzeContract}
                      disabled={!contractText.trim() || isLoading || !session}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black bg-gradient-to-l from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-900/40 hover:shadow-indigo-700/50 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                      {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      {isLoading ? 'جاري التحليل...' : 'تحليل العقد'}
                    </button>
                  </div>

                  {analysisError && !isLoading && (
                    <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{analysisError}</span>
                    </div>
                  )}

                  {/* Report */}
                  {isLoading && (
                    <div className="mt-6 flex flex-col items-center justify-center py-12 space-y-3">
                      <div className="relative">
                        <div className="w-16 h-16 rounded-full border-4 border-slate-800" />
                        <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-transparent border-t-indigo-500 animate-spin" />
                        <Zap className="w-6 h-6 text-indigo-400 absolute inset-0 m-auto" />
                      </div>
                      <p className="text-sm text-slate-400 font-bold">جاري تفكيك البنود ومقارنتها بالنظام...</p>
                    </div>
                  )}

                  {report && !isLoading && (
                    <div className="mt-6 space-y-4 animate-[fadeIn_0.4s_ease]">
                      {/* Score Header */}
                      <div className="flex items-center gap-5 p-5 rounded-xl bg-gradient-to-l from-slate-950 to-slate-900/40 border border-slate-800">
                        <div className="relative w-20 h-20 flex-shrink-0">
                          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                            <circle cx="40" cy="40" r="34" fill="none" stroke="#1e293b" strokeWidth="6" />
                            <circle
                              cx="40"
                              cy="40"
                              r="34"
                              fill="none"
                              stroke={report.score >= 70 ? '#10b981' : report.score >= 40 ? '#f59e0b' : '#ef4444'}
                              strokeWidth="6"
                              strokeLinecap="round"
                              strokeDasharray={`${(report.score / 100) * 214} 214`}
                              className="transition-all duration-1000"
                            />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-xl font-black text-white">{report.score}</span>
                            <span className="text-[8px] text-slate-500">/ 100</span>
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-slate-500 mb-1">النتيجة الإجمالية للامتثال</p>
                          <h4 className="text-sm font-black text-white mb-2">{report.status}</h4>
                          <div className="flex items-center gap-4 text-xs">
                            <span className="flex items-center gap-1 text-red-400">
                              <span className="w-2 h-2 rounded-full bg-red-500" /> عالية: {report.riskMatrix.high}
                            </span>
                            <span className="flex items-center gap-1 text-amber-400">
                              <span className="w-2 h-2 rounded-full bg-amber-500" /> متوسطة: {report.riskMatrix.medium}
                            </span>
                            <span className="flex items-center gap-1 text-sky-400">
                              <span className="w-2 h-2 rounded-full bg-sky-500" /> منخفضة: {report.riskMatrix.low}
                            </span>
                          </div>
                        </div>
                        <div className="text-left border-r border-slate-800 pr-5">
                          <p className="text-xs text-slate-500 mb-1">إجمالي الالتزام المالي</p>
                          <p className="text-lg font-black text-red-400">{formatCurrency(report.totalFinancialLiability)}</p>
                          <p className="text-[10px] text-slate-600 mt-0.5">{report.timestamp}</p>
                        </div>
                      </div>

                      {/* Issues */}
                      {report.issues.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-3">
                            <CheckCircle className="w-7 h-7 text-emerald-400" />
                          </div>
                          <p className="text-sm font-bold text-emerald-300">جميع البنود متوافقة — لا توجد مخالفات</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {report.issues.map((issue) => {
                            const cfg = severityConfig[issue.severity];
                            return (
                              <div
                                key={issue.id}
                                className={`rounded-xl border ${cfg.border} ${cfg.bg} p-5 transition-all hover:shadow-lg`}
                              >
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                                    <span className={`text-xs font-black ${cfg.color}`}>{cfg.label}</span>
                                    <span className="text-slate-600 text-xs">•</span>
                                    <span className="text-xs font-bold text-slate-400">{issue.article_reference}</span>
                                  </div>
                                  <span className="text-xs font-bold text-red-400 flex items-center gap-1">
                                    <DollarSign className="w-3.5 h-3.5" />
                                    {formatCurrency(issue.financialRisk)}
                                  </span>
                                </div>

                                <div className="space-y-2 mb-3">
                                  <div className="bg-red-950/20 border border-red-900/30 rounded-lg p-3">
                                    <p className="text-[10px] font-bold text-red-400 mb-1 uppercase tracking-wide">النص المخالف</p>
                                    <p className="text-xs text-slate-300 leading-relaxed">{issue.original_text}</p>
                                  </div>
                                  <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-lg p-3">
                                    <p className="text-[10px] font-bold text-emerald-400 mb-1 uppercase tracking-wide">النص البديل المقترح</p>
                                    <p className="text-xs text-slate-300 leading-relaxed">{issue.suggested_text}</p>
                                  </div>
                                </div>

                                <p className="text-xs text-slate-400 leading-relaxed mb-2">{issue.why_explanation}</p>
                                <p className="text-xs text-amber-300/80 leading-relaxed mb-4 bg-amber-950/20 border border-amber-900/20 rounded-lg p-2.5">
                                  {issue.courtPrediction}
                                </p>

                                <button
                                  onClick={() => handleApplyFix(issue.id, issue.suggested_text, issue.original_text)}
                                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-black bg-emerald-600/20 border border-emerald-600/40 text-emerald-300 hover:bg-emerald-600/30 hover:border-emerald-500/60 transition-all active:scale-95"
                                >
                                  <Check className="w-4 h-4" />
                                  تطبيق الإصلاح وإدراج النص البديل
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* History Sidebar */}
                <div className="bg-gradient-to-br from-slate-900/80 to-slate-900/30 border border-slate-800/60 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                      <History className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">سجل المراجعات</h3>
                      <p className="text-[11px] text-slate-500">آخر العقود المدققة</p>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {history.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/40 border border-slate-800/50 hover:border-slate-700 transition-colors cursor-pointer group"
                      >
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-black ${
                            h.score >= 80
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : h.score >= 50
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'bg-red-500/10 text-red-400'
                          }`}
                        >
                          {h.score}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-200 truncate">{h.name}</p>
                          <p className="text-[10px] text-slate-500 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {h.date}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 group-hover:-translate-x-0.5 transition-all" />
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 pt-5 border-t border-slate-800/50">
                    <div className="flex items-center gap-2 mb-3">
                      <Gavel className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-bold text-white">محاكي الأحكام القضائية</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      يقوم النظام بتوقع مسار القضاء العمالي السعودي بناءً على سوابق المحاكم لكل بند مخالف، مما يضاعف دقة تقدير المخاطر.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===================== HOLDINGS ===================== */}
          {currentTab === 'holdings' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'إجمالي الشركات التابعة', value: subsidiaries.length, icon: Building2, color: 'indigo' },
                  { label: 'إجمالي العقود', value: subsidiaries.reduce((a, b) => a + b.contracts, 0), icon: FileText, color: 'emerald' },
                  { label: 'متوسط الامتثال', value: `${Math.round(subsidiaries.reduce((a, b) => a + b.compliance, 0) / subsidiaries.length)}%`, icon: Shield, color: 'amber' },
                  { label: 'شركات تحت المراقبة', value: subsidiaries.filter((s) => s.status !== 'مستقر' && s.status !== 'ممتثل').length, icon: ShieldAlert, color: 'red' },
                ].map((s) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.label} className="bg-gradient-to-br from-slate-900/80 to-slate-900/30 border border-slate-800/60 rounded-2xl p-5">
                      <div className={`w-10 h-10 rounded-xl bg-${s.color}-500/10 border border-${s.color}-500/20 flex items-center justify-center mb-3`}>
                        <Icon className={`w-5 h-5 text-${s.color}-400`} />
                      </div>
                      <p className="text-2xl font-black text-white">{s.value}</p>
                      <p className="text-xs text-slate-500 mt-1">{s.label}</p>
                    </div>
                  );
                })}
              </div>

              <div className="bg-gradient-to-br from-slate-900/80 to-slate-900/30 border border-slate-800/60 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                      <Layers className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">لوحة الشركات القابضة</h3>
                      <p className="text-[11px] text-slate-500">مراقبة الامتثال عبر كافة الكيانات التابعة</p>
                    </div>
                  </div>
                  <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600/20 border border-indigo-600/40 text-indigo-300 hover:bg-indigo-600/30 transition-colors">
                    <Building2 className="w-3.5 h-3.5" />
                    إضافة شركة
                  </button>
                </div>

                <div className="space-y-3">
                  {subsidiaries.map((sub) => {
                    const color =
                      sub.compliance >= 85
                        ? { bar: 'bg-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' }
                        : sub.compliance >= 60
                        ? { bar: 'bg-amber-500', text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' }
                        : { bar: 'bg-red-500', text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' };
                    return (
                      <div key={sub.id} className={`rounded-xl border ${color.border} ${color.bg} p-5`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-slate-900/60 flex items-center justify-center">
                              <Building2 className="w-5 h-5 text-slate-400" />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-white">{sub.name}</h4>
                              <p className="text-[11px] text-slate-500">{sub.contracts} عقد نشط</p>
                            </div>
                          </div>
                          <span className={`text-xs font-black px-3 py-1 rounded-full ${color.bg} ${color.text} border ${color.border}`}>
                            {sub.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 rounded-full bg-slate-950/60 overflow-hidden">
                            <div
                              className={`h-full ${color.bar} rounded-full transition-all duration-1000`}
                              style={{ width: `${sub.compliance}%` }}
                            />
                          </div>
                          <span className={`text-sm font-black ${color.text}`}>{sub.compliance}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ===================== TEAM ===================== */}
          {currentTab === 'team' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-slate-900/80 to-slate-900/30 border border-slate-800/60 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
                      <Users className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">إدارة الفريق والمقاعد</h3>
                      <p className="text-[11px] text-slate-500">{team.length} مقاعد نشطة من 10 مقاعد متاحة</p>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setTeam([
                        ...team,
                        { id: String(Date.now()), name: 'عضو جديد', email: 'new@saudilegal.ai', role: 'مراجع' },
                      ])
                    }
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600/20 border border-emerald-600/40 text-emerald-300 hover:bg-emerald-600/30 transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    دعوة عضو
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {team.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 p-4 rounded-xl bg-slate-950/40 border border-slate-800/50 hover:border-slate-700 transition-colors group"
                    >
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-black">
                        {member.name.charAt(member.name.indexOf(' ') + 1) || member.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{member.name}</p>
                        <p className="text-[11px] text-slate-500 truncate">{member.email}</p>
                        <span className="inline-block mt-1 text-[10px] font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-2 py-0.5">
                          {member.role}
                        </span>
                      </div>
                      <button
                        onClick={() => setTeam(team.filter((t) => t.id !== member.id))}
                        className="w-8 h-8 rounded-lg bg-slate-800/60 hover:bg-red-900/40 flex items-center justify-center transition-colors"
                      >
                        <UserMinus className="w-4 h-4 text-slate-500 group-hover:text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ===================== BILLING ===================== */}
          {currentTab === 'billing' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Current Plan */}
                <div className="lg:col-span-2 bg-gradient-to-br from-indigo-950/40 to-slate-900/40 border border-indigo-700/30 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-amber-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-white">الخطة الحالية: المؤسسية</h3>
                        <p className="text-[11px] text-slate-500">تجديد تلقائي في 2026/08/01</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1">
                      نشط
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-6">
                    {[
                      { label: 'المقاعد المستخدمة', value: `${team.length} / 10` },
                      { label: 'العقود هذا الشهر', value: '247 / ∞' },
                      { label: 'الحد الشهري', value: formatCurrency(2400) },
                    ].map((item) => (
                      <div key={item.label} className="bg-slate-950/40 border border-slate-800/50 rounded-xl p-4">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide">{item.label}</p>
                        <p className="text-lg font-black text-white mt-1">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black bg-indigo-600 text-white hover:bg-indigo-500 transition-colors">
                      <CreditCard className="w-4 h-4" />
                      إدارة طريقة الدفع
                    </button>
                    <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black bg-slate-800/60 border border-slate-700 text-slate-300 hover:bg-slate-700/60 transition-colors">
                      <Download className="w-4 h-4" />
                      تحميل الفواتير
                    </button>
                  </div>
                </div>

                {/* Usage */}
                <div className="bg-gradient-to-br from-slate-900/80 to-slate-900/30 border border-slate-800/60 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-sky-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">الاستخدام</h3>
                      <p className="text-[11px] text-slate-500">إحصائيات الشهر الحالي</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {[
                      { label: 'تحليلات العقود', value: 247, max: 500, color: 'bg-indigo-500' },
                      { label: 'مقاعد الفريق', value: team.length, max: 10, color: 'bg-emerald-500' },
                      { label: 'تقارير الامتثال', value: 38, max: 100, color: 'bg-amber-500' },
                    ].map((u) => (
                      <div key={u.label}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs text-slate-400">{u.label}</span>
                          <span className="text-xs font-bold text-white">
                            {u.value} / {u.max}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-950/60 overflow-hidden">
                          <div
                            className={`h-full ${u.color} rounded-full transition-all duration-1000`}
                            style={{ width: `${(u.value / u.max) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Invoices */}
              <div className="bg-gradient-to-br from-slate-900/80 to-slate-900/30 border border-slate-800/60 rounded-2xl p-6">
                <h3 className="text-sm font-black text-white mb-4">سجل الفواتير</h3>
                <div className="space-y-2">
                  {[
                    { id: 'INV-2026-007', date: '2026-07-01', amount: 2400, status: 'مدفوعة' },
                    { id: 'INV-2026-006', date: '2026-06-01', amount: 2400, status: 'مدفوعة' },
                    { id: 'INV-2026-005', date: '2026-05-01', amount: 1800, status: 'مدفوعة' },
                  ].map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-slate-800/50 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-slate-500" />
                        <div>
                          <p className="text-xs font-bold text-white">{inv.id}</p>
                          <p className="text-[10px] text-slate-500">{inv.date}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-bold text-white">{formatCurrency(inv.amount)}</span>
                        <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                          {inv.status}
                        </span>
                        <button className="text-slate-500 hover:text-white transition-colors">
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
