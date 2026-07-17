import React, { useState } from 'react';

function Dashboard() {
  const [contractSearch, setContractSearch] = useState('');

  return (
    <div style={{ backgroundColor: '#0f172a', color: '#f8fafc', minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif', direction: 'rtl' }}>
      {/* الشريط العلوي */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '15px' }}>
        <div>
          <h1 style={{ fontSize: '24px', margin: '0' }}>💼 SaudiLegal.ai</h1>
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: '5px 0 0 0' }}>مراقبة الامتثال القانوني وفق نظام العمل السعودي المحدث 2026</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ width: '10px', height: '10px', backgroundColor: '#22c55e', borderRadius: '50%', display: 'inline-block' }}></span>
          <span style={{ fontSize: '14px', color: '#4ade80' }}>🟢 النظام يعمل</span>
        </div>
      </div>

      {/* شريط البحث المتقدم */}
      <div style={{ margin: '30px 0', textAlign: 'center' }}>
        <input 
          type="text" 
          placeholder="🔍 بحث في العقود والامتثال التشريعي..." 
          value={contractSearch}
          onChange={(e) => setContractSearch(e.target.value)}
          style={{ width: '80%', maxWidth: '600px', padding: '12px 20px', borderRadius: '8px', border: '1px solid #475569', backgroundColor: '#1e293b', color: '#fff', fontSize: '16px', outline: 'none' }}
        />
      </div>

      {/* بطاقات الإحصائيات والنسب المئوية */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginTop: '20px' }}>
        <div style={{ backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
          <h3 style={{ margin: '0', color: '#94a3b8', fontSize: '14px' }}>📊 نسبة الالتزام العام</h3>
          <p style={{ fontSize: '28px', fontWeight: 'bold', margin: '10px 0 5px 0', color: '#38bdf8' }}>94%</p>
          <span style={{ color: '#4ade80', fontSize: '12px' }}>📈 5%+ منذ الشهر الماضي</span>
        </div>

        <div style={{ backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
          <h3 style={{ margin: '0', color: '#94a3b8', fontSize: '14px' }}>📝 العقود المفحوصة</h3>
          <p style={{ fontSize: '28px', fontWeight: 'bold', margin: '10px 0 5px 0', color: '#a78bfa' }}>142 عقد</p>
          <span style={{ color: '#4ade80', fontSize: '12px' }}>📈 12%+ عقود جديدة</span>
        </div>

        <div style={{ backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
          <h3 style={{ margin: '0', color: '#94a3b8', fontSize: '14px' }}>⚠️ ثغرات قانونية مكتشفة</h3>
          <p style={{ fontSize: '28px', fontWeight: 'bold', margin: '10px 0 5px 0', color: '#f87171' }}>2 فقط</p>
          <span style={{ color: '#f87171', fontSize: '12px' }}>📉 انخفاض المخاطر العمالية</span>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
