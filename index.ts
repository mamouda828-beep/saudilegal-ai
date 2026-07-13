// Supabase Edge Function — تحليل حقيقي لعقود العمل عبر Anthropic API
// يعمل هذا الكود على خادم Supabase (Deno)، وليس في متصفح المستخدم.
// مفتاح الـ API يُقرأ من Secrets الخاصة بالمشروع ولا يظهر أبداً للواجهة الأمامية.

import { createClient } from 'npm:@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// نفس القواعد القانونية الموجودة أصلاً في App.tsx، لكن الآن تُستخدم فعلياً
// كموجّه (prompt) حقيقي يُرسل للنموذج، بدل أن تكون نصاً معروضاً فقط بدون تأثير.
const LEGAL_SYSTEM_PROMPT = `أنت مستشار قانوني متخصص في نظام العمل السعودي.
مهمتك: تحليل نص عقد العمل المُدخل وفحصه مقابل المواد التالية حصراً:
1. فترة التجربة (المادة 53/54): الحد الأقصى 90 يوماً، والتمديد يتطلب اتفاقاً كتابياً مستقلاً بعد مباشرة العمل.
2. عدم المنافسة (المادة 83): حد أقصى سنتان، مع تحديد دقيق للمكان ونوع العمل.
3. ساعات العمل والإضافي (المادة 98/101/107): 8 ساعات يومياً، والإضافي بأجر الساعة + 50%.
4. الإجازات ومكافأة نهاية الخدمة (المادة 84/85/109): 21 يوماً كحد أدنى، والتنازل عن المكافأة باطل.
5. حظر إسقاط حق التقاضي (المادة 5): أي بند يُجبر الموظف على التنازل عن حق اللجوء للمحاكم العمالية باطل.

أعد ردك بصيغة JSON فقط، بدون أي نص إضافي قبله أو بعده، بالشكل التالي بالضبط:
{
  "score": <رقم من 0 إلى 100>,
  "status_summary": "<جملة تلخيصية بالعربية>",
  "issues": [
    {
      "article_reference": "<رقم المادة>",
      "severity": "High" | "Medium" | "Low",
      "status": "compliant" | "non-compliant",
      "original_text": "<الاقتباس الحرفي من العقد>",
      "suggested_text": "<الصياغة المقترحة المتوافقة>",
      "why_explanation": "<شرح سبب المخالفة>",
      "court_prediction": "<جملة تبدأ بـ ⚖️ تتوقع موقف القضاء العمالي من هذا البند>",
      "financial_risk": <رقم تقديري بالريال السعودي>
    }
  ]
}`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY غير مُعرّف في Secrets الخاصة بالمشروع.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // التحقق من هوية المستخدم عبر التوكن المرسل من الواجهة الأمامية
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'غير مصرح — الرجاء تسجيل الدخول.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'جلسة غير صالحة.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { contractId, contractText } = await req.json();
    if (!contractText || typeof contractText !== 'string' || contractText.trim().length < 20) {
      return new Response(JSON.stringify({ error: 'نص العقد فارغ أو قصير جداً للتحليل.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // استدعاء Anthropic API فعلياً
    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: LEGAL_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `حلّل عقد العمل التالي:\n\n${contractText}` }],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      return new Response(JSON.stringify({ error: `فشل استدعاء AI: ${errText}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResponse.json();
    const rawText = aiData.content?.[0]?.text ?? '{}';

    let parsed;
    try {
      // إزالة أي ```json``` قد يضيفها النموذج رغم التعليمات
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(JSON.stringify({ error: 'تعذّر تفسير رد AI كـ JSON صالح.', raw: rawText }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // حساب المؤشرات وحفظ النتيجة في قاعدة البيانات (اختياري هنا، أو تُحفظ من الواجهة)
    const riskCounts = { high: 0, medium: 0, low: 0 };
    let totalRisk = 0;
    for (const issue of parsed.issues ?? []) {
      if (issue.severity === 'High') riskCounts.high++;
      else if (issue.severity === 'Medium') riskCounts.medium++;
      else riskCounts.low++;
      totalRisk += Number(issue.financial_risk) || 0;
    }

    const { data: report, error: insertError } = await supabaseAdmin
      .from('audit_reports')
      .insert({
        contract_id: contractId,
        score: parsed.score,
        status_summary: parsed.status_summary,
        risk_high: riskCounts.high,
        risk_medium: riskCounts.medium,
        risk_low: riskCounts.low,
        total_financial_liability: totalRisk,
      })
      .select()
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: `فشل حفظ التقرير: ${insertError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (parsed.issues?.length) {
      await supabaseAdmin.from('audit_issues').insert(
        parsed.issues.map((issue: Record<string, unknown>) => ({
          report_id: report.id,
          article_reference: issue.article_reference,
          severity: issue.severity,
          status: issue.status,
          original_text: issue.original_text,
          suggested_text: issue.suggested_text,
          why_explanation: issue.why_explanation,
          court_prediction: issue.court_prediction,
          financial_risk: issue.financial_risk,
        }))
      );
    }

    await supabaseAdmin.from('contracts').update({ status: 'done' }).eq('id', contractId);

    return new Response(JSON.stringify({ report, issues: parsed.issues }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
